"""PostgreSQL contract for M3 session privacy and one-active-session integrity."""

from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

def test_workout_tables_are_private_and_restrict_active_workouts(test_database_url: str) -> None:
    command.upgrade(Config("alembic.ini"), "head")
    engine = create_engine(test_database_url)
    try:
        with engine.connect() as conn:
            rls = conn.execute(text(
                "SELECT relname, relrowsecurity FROM pg_class "
                "WHERE relname IN ('workout_sessions', 'workout_mutation_receipts') "
                "ORDER BY relname"
            )).all()
            grants = conn.execute(text(
                "SELECT grantee, table_name FROM information_schema.table_privileges "
                "WHERE table_name IN ('workout_sessions', 'workout_mutation_receipts') "
                "AND grantee IN ('anon', 'authenticated', 'service_role')"
            )).all()
            indexes = conn.execute(text(
                "SELECT indexdef FROM pg_indexes WHERE tablename = 'workout_sessions'"
            )).scalars().all()
            fk_constraints = conn.execute(text(
                "SELECT confdeltype FROM pg_constraint "
                "WHERE conrelid = 'workout_mutation_receipts'::regclass "
                "AND contype = 'f'"
            )).scalars().all()
            head = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        assert head == "20261009_0003"
        assert rls == [
            ("workout_mutation_receipts", True),
            ("workout_sessions", True),
        ]
        assert grants == []
        assert any("UNIQUE INDEX ix_workout_sessions_one_active_per_owner" in item for item in indexes)
        assert fk_constraints and all(item == "r" for item in fk_constraints)
    finally:
        engine.dispose()
