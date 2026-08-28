"""Environment-bound configuration for PostgreSQL connections."""

from __future__ import annotations

from enum import StrEnum

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


class Environment(StrEnum):
    """Supported deployment environments."""

    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class DatabaseSettings(BaseSettings):
    """Validated psycopg 3 PostgreSQL settings loaded from KEYLORNET variables."""

    model_config = SettingsConfigDict(
        env_prefix="KEYLORNET_", case_sensitive=False, extra="ignore"
    )

    environment: Environment = Environment.DEVELOPMENT
    database_url: str

    @field_validator("database_url")
    @classmethod
    def validate_postgres_url(cls, value: str) -> str:
        """Require the project's explicit PostgreSQL psycopg 3 URL and database."""
        try:
            url = make_url(value)
        except Exception as exc:
            raise ValueError("must be a valid SQLAlchemy database URL") from exc
        if url.drivername != "postgresql+psycopg":
            raise ValueError("must use postgresql+psycopg:// with psycopg 3")
        if not url.database:
            raise ValueError("must include a database name")
        return value

    def sqlalchemy_url(self) -> URL:
        """Return the parsed SQLAlchemy URL without logging its credentials."""
        return make_url(self.database_url)

    def validate_test_target(self) -> None:
        """Reject a test run unless its target database is explicitly disposable."""
        if self.environment is not Environment.TEST:
            raise ValueError("KEYLORNET_ENVIRONMENT must be 'test' for migration tests")
        database_name = self.sqlalchemy_url().database
        assert database_name is not None
        if not database_name.endswith("_test"):
            raise ValueError("test database name must end with '_test'")
