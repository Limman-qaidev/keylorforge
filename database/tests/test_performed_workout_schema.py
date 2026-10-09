"""Real PostgreSQL owner isolation and first-set FK migration structure."""
from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_performed_history_migration_is_private_and_first_set_is_mandatory(
    test_database_url: str,
) -> None:
    command.upgrade(Config("alembic.ini"), "head")
    engine = create_engine(test_database_url)
    try:
        with engine.connect() as conn:
            version = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            rls = conn.execute(
                text(
                    "SELECT relname, relrowsecurity FROM pg_class "
                    "WHERE relname IN ('workout_occurrences', 'workout_sets') "
                    "ORDER BY relname"
                )
            ).all()
            public_grants = conn.execute(
                text(
                    "SELECT grantee, table_name FROM information_schema.table_privileges "
                    "WHERE table_name IN ('workout_occurrences', 'workout_sets') "
                    "AND grantee IN ('anon', 'authenticated', 'service_role')"
                )
            ).all()
            first_set = conn.execute(
                text(
                    "SELECT condeferrable, condeferred, confdeltype "
                    "FROM pg_constraint "
                    "WHERE conname = 'fk_workout_occurrences_first_set'"
                )
            ).one()
            set_fk = conn.execute(
                text(
                    "SELECT confdeltype FROM pg_constraint "
                    "WHERE conrelid = 'workout_sets'::regclass "
                    "AND contype = 'f' ORDER BY conname"
                )
            ).scalars().all()
    finally:
        engine.dispose()
    assert version == "20261009_0002"
    assert rls == [
        ("workout_occurrences", True),
        ("workout_sets", True),
    ]
    assert public_grants == []
    assert first_set == (True, True, "a")  # deferred NO ACTION
    assert set_fk and all(action == "r" for action in set_fk)
