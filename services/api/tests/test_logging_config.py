"""Logging configuration tests."""

import logging

from app.logging_config import configure_logging


def test_configure_logging_preserves_existing_root_handlers() -> None:
    """Injected levels apply without removing externally managed handlers."""
    root_logger = logging.getLogger()
    original_handlers = root_logger.handlers[:]
    original_level = root_logger.level
    existing_handler = logging.NullHandler()

    root_logger.handlers.clear()
    root_logger.addHandler(existing_handler)
    root_logger.setLevel(logging.WARNING)

    try:
        configure_logging("DEBUG")

        assert root_logger.level == logging.DEBUG
        assert existing_handler in root_logger.handlers
        assert root_logger.handlers == [existing_handler]
    finally:
        root_logger.handlers.clear()
        root_logger.handlers.extend(original_handlers)
        root_logger.setLevel(original_level)
        existing_handler.close()
