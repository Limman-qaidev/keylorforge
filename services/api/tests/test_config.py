"""Application settings tests."""

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_log_level_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYLORFORGE_LOG_LEVEL", "debug")

    settings = Settings()

    assert settings.log_level == "DEBUG"


def test_invalid_log_level_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KEYLORFORGE_LOG_LEVEL", "VERBOSE")

    with pytest.raises(ValidationError):
        Settings()
