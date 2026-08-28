"""Migration-chain validation against an explicitly configured PostgreSQL test DB."""

from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_upgrade_clean_database_records_head(test_database_url: str) -> None:
    """A clean PostgreSQL database upgrades to the baseline revision."""
    engine = create_engine(test_database_url)
    with engine.connect() as connection:
        tables = connection.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        ).scalars().all()

    assert tables == [], "migration test requires a clean PostgreSQL test database"

    config = Config("alembic.ini")
    command.upgrade(config, "head")

    with engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()

    assert revision == "20260828_0001"
