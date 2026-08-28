"""Health endpoint tests."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_stable_success_contract() -> None:
    """The health endpoint must be available without product dependencies."""
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
