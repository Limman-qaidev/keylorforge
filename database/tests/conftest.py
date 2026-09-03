"""Shared test configuration for PostgreSQL-backed migration tests."""

from __future__ import annotations

import os

import pytest

from keylorforge_database.config import DatabaseSettings


@pytest.fixture
def test_database_url(monkeypatch: pytest.MonkeyPatch) -> str:
    """Return a verified disposable database URL or skip integration coverage."""
    url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if url is None:
        pytest.skip("KEYLORFORGE_TEST_DATABASE_URL is required for PostgreSQL migration tests")
    monkeypatch.setenv("KEYLORFORGE_ENVIRONMENT", "test")
    monkeypatch.setenv("KEYLORFORGE_DATABASE_URL", url)
    DatabaseSettings().validate_test_target()
    return url
