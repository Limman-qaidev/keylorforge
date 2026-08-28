"""Unit tests for database configuration safety checks."""

import pytest
from pydantic import ValidationError

from keylornet_database.config import DatabaseSettings, Environment
from keylornet_database.engine import create_database_engine, create_session_factory


def test_accepts_postgresql_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "KEYLORNET_DATABASE_URL", "postgresql+psycopg://user:pass@localhost/keylornet"
    )

    settings = DatabaseSettings()

    assert settings.environment is Environment.DEVELOPMENT
    assert settings.sqlalchemy_url().get_backend_name() == "postgresql"
    assert settings.sqlalchemy_url().drivername == "postgresql+psycopg"


def test_rejects_missing_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("KEYLORNET_DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        DatabaseSettings()


@pytest.mark.parametrize(
    "url",
    [
        "sqlite:///keylornet.db",
        "not a url",
        "postgresql://localhost/keylornet",
        "postgresql+psycopg2://localhost/keylornet",
        "postgresql+asyncpg://localhost/keylornet",
        "postgresql+psycopg://localhost",
    ],
)
def test_rejects_invalid_database_url(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    monkeypatch.setenv("KEYLORNET_DATABASE_URL", url)

    with pytest.raises(ValidationError):
        DatabaseSettings()


def test_creates_sync_psycopg_engine_and_session_factory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "KEYLORNET_DATABASE_URL", "postgresql+psycopg://user:pass@localhost/keylornet"
    )

    settings = DatabaseSettings()
    engine = create_database_engine(settings)
    session_factory = create_session_factory(settings)

    try:
        assert engine.dialect.name == "postgresql"
        assert engine.dialect.driver == "psycopg"
        assert session_factory.kw["bind"].dialect.driver == "psycopg"
    finally:
        engine.dispose()
        session_factory.kw["bind"].dispose()


def test_rejects_non_disposable_test_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYLORNET_ENVIRONMENT", "test")
    monkeypatch.setenv(
        "KEYLORNET_DATABASE_URL", "postgresql+psycopg://user:pass@localhost/keylornet"
    )

    with pytest.raises(ValueError, match="must end with '_test'"):
        DatabaseSettings().validate_test_target()
