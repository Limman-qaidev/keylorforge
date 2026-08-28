"""Environment-driven application settings."""

from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class Settings(BaseSettings):
    """Typed settings loaded from environment variables."""

    app_name: str = "keylornet-api"
    environment: Literal["development", "test", "production"] = "development"
    log_level: LogLevel = "INFO"

    model_config = SettingsConfigDict(env_prefix="KEYLORNET_")

    @field_validator("log_level", mode="before")
    @classmethod
    def normalize_log_level(cls, value: object) -> object:
        """Normalize case before validating the configured log level."""
        if isinstance(value, str):
            return value.upper()
        return value
