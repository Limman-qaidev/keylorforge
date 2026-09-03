"""Explicit engine and session-factory construction."""

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from keylorforge_database.config import DatabaseSettings


def create_database_engine(settings: DatabaseSettings) -> Engine:
    """Create a synchronous PostgreSQL engine without opening a connection."""
    return create_engine(settings.sqlalchemy_url(), pool_pre_ping=True)


def create_session_factory(settings: DatabaseSettings) -> sessionmaker[Session]:
    """Create a session factory for repositories; callers own session lifetime."""
    return sessionmaker(bind=create_database_engine(settings), autoflush=False)
