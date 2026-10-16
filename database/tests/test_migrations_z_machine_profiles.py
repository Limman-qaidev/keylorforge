"""Real PostgreSQL Machine Profile privacy and cross-owner FK invariants."""

from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_machine_profile_migration_has_private_owner_scoped_constraints(
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
                    "WHERE relname IN ('machine_profiles', 'machine_configurations', "
                    "'machine_mutation_receipts') ORDER BY relname"
                )
            ).all()
            public_grants = conn.execute(
                text(
                    "SELECT grantee, table_name FROM information_schema.table_privileges "
                    "WHERE table_name IN ('machine_profiles', "
                    "'machine_configurations', 'machine_mutation_receipts') "
                    "AND grantee IN ('anon', 'authenticated', 'service_role')"
                )
            ).all()
            set_fks = conn.execute(
                text(
                    "SELECT conname, confdeltype FROM pg_constraint "
                    "WHERE conrelid = 'workout_sets'::regclass "
                    "AND conname IN ("
                    "'fk_workout_sets_machine_profile_owner', "
                    "'fk_workout_sets_machine_configuration_profile_owner'"
                    ") ORDER BY conname"
                )
            ).all()
            profile_fk = conn.execute(
                text(
                    "SELECT conname, confdeltype FROM pg_constraint "
                    "WHERE conrelid = 'machine_configurations'::regclass "
                    "AND contype = 'f'"
                )
            ).all()
    finally:
        engine.dispose()
    assert version == "20261009_0003"
    assert rls == [
        ("machine_configurations", True),
        ("machine_mutation_receipts", True),
        ("machine_profiles", True),
    ]
    assert public_grants == []
    assert set_fks == [
        ("fk_workout_sets_machine_configuration_profile_owner", "r"),
        ("fk_workout_sets_machine_profile_owner", "r"),
    ]
    assert len(profile_fk) == 1 and profile_fk[0][1] == "r"
