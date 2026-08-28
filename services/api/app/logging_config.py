"""Logging setup for the API process."""

import logging

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging(log_level: str) -> None:
    """Apply the configured level without replacing host logging handlers."""
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level.upper())

    if root_logger.handlers:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(handler)
