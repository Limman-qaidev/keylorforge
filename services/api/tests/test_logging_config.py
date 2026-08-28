"""Logging configuration tests."""

import logging

from app.logging_config import configure_logging


def test_configure_logging_replaces_existing_root_configuration() -> None:
    """An injected level applies even when the root logger already has a handler."""
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
        assert existing_handler not in root_logger.handlers
    finally:
        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)
            handler.close()
        root_logger.handlers.extend(original_handlers)
        root_logger.setLevel(original_level)
