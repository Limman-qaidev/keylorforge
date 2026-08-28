"""Unit tests for database configuration safety checks."""

import pytest
from pydantic import ValidationError

from keylornet_database.config import DatabaseSettings, Environment


def test_accepts_postgresql_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYLORNET_DATABASE_URL", "postgresql+psycopg://user:pass@localhost/keylornet")

    settings = DatabaseSettings()

    assert settings.environment is Environment.DEVELOPMENT
    assert settings.sqlalchemy_url().get_backend_name() == "postgresql"


def test_rejects_missing_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("KEYLORNET_DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        DatabaseSettings()


@pytest.mark.parametrize("url", ["sqlite:///keylornet.db", "not a url", "postgresql://localhost"])
def test_rejects_invalid_database_url(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setenv("KEYLORNET_DATABASE_URL", url)

    with pytest.raises(ValidationError):
        DatabaseSettings()


def test_rejects_non_disposable_test_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYLORNET_ENVIRONMENT", "test")
    monkeypatch.setenv("KEYLORNET_DATABASE_URL", "postgresql://user:pass@localhost/keylornet")

    with pytest.raises(ValueError, match="must end with '_test'"):
        DatabaseSettings().validate_test_target()
