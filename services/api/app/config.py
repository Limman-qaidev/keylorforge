"""Environment-driven application settings."""

from typing import Literal

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class Settings(BaseSettings):
    """Typed settings loaded from environment variables."""

    app_name: str = "keylornet-api"
    environment: Literal["development", "test", "production"] = "development"
    log_level: LogLevel = "INFO"
    supabase_project_url: AnyHttpUrl | None = None
    supabase_jwks_cache_seconds: int = 300

    model_config = SettingsConfigDict(env_prefix="KEYLORNET_")

    @field_validator("log_level", mode="before")
    @classmethod
    def normalize_log_level(cls, value: object) -> object:
        """Normalize case before validating the configured log level."""
        if isinstance(value, str):
            return value.upper()
        return value

    def supabase_issuer(self) -> str:
        """Return the only issuer trusted for Supabase access tokens."""
        if self.supabase_project_url is None:
            raise ValueError(
                "KEYLORNET_SUPABASE_PROJECT_URL is required for protected routes"
            )
        return f"{str(self.supabase_project_url).rstrip('/')}/auth/v1"

    def supabase_jwks_url(self) -> str:
        """Return the JWKS URL derived from the configured trusted issuer."""
        return f"{self.supabase_issuer()}/.well-known/jwks.json"
