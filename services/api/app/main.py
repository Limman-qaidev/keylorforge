"""FastAPI application entry point."""

from fastapi import FastAPI

from app.config import Settings
from app.logging_config import configure_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the configured FastAPI application."""
    resolved_settings = settings or Settings()
    configure_logging(resolved_settings.log_level)

    application = FastAPI(title=resolved_settings.app_name)

    @application.get("/health")
    def health() -> dict[str, str]:
        """Return the stable service health contract."""
        return {"status": "ok"}

    return application


app = create_app()
