"""FastAPI application entry point."""

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.config import Settings
from app.logging_config import configure_logging


class HealthResponse(BaseModel):
    """Stable health endpoint response."""

    status: Literal["ok"] = "ok"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the configured FastAPI application."""
    resolved_settings = settings or Settings()
    configure_logging(resolved_settings.log_level)

    application = FastAPI(title=resolved_settings.app_name)

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Return the stable service health contract."""
        return HealthResponse()

    return application


app = create_app()
