"""HTTP input/auth contracts and purity of Free Workout start."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_database_session, require_active_application_user
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.config import Settings
from app.main import create_app


class _Verifier:
    def verify(self, token: str) -> AuthenticatedPrincipal:
        assert token == "valid-token"
        return AuthenticatedPrincipal(uuid4())


def _client() -> TestClient:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier()
    app.dependency_overrides[get_database_session] = lambda: iter((object(),))
    app.dependency_overrides[require_active_application_user] = lambda: None
    return TestClient(app)


@pytest.mark.parametrize(
    "path", ["/workout-sessions/active", "/workout-sessions/start"]
)
def test_protected_workout_endpoints_require_bearer(path: str) -> None:
    client = TestClient(create_app())
    response = (
        client.get(path) if path.endswith("/active") else client.post(path, json={})
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "mutation",
    [
        {"started_at": "2026-10-08T12:30:00"},
        {"time_zone": "Unknown/Invented"},
        {"origin": "template"},
        {"owner_user_id": "foreign"},
        {"protocol_version": 2},
        {"started_at": "0001-01-01T00:00:00+14:00"},
        {"started_at": "9999-12-31T23:59:59-14:00"},
    ],
)
def test_start_rejects_ambiguous_date_or_unapproved_fields(
    mutation: dict[str, str | int],
) -> None:
    body = {
        "protocol_version": 1,
        "session_id": str(uuid4()),
        "mutation_id": str(uuid4()),
        "started_at": "2026-10-08T12:30:00+00:00",
        "time_zone": "Europe/Madrid",
    }
    body.update(mutation)
    response = _client().post(
        "/workout-sessions/start",
        headers={"Authorization": "Bearer valid-token"},
        json=body,
    )
    assert response.status_code == 422


def test_start_and_resume_are_declared_in_openapi() -> None:
    paths = create_app().openapi()["paths"]
    assert "/workout-sessions/start" in paths
    assert "/workout-sessions/active" in paths
    assert paths["/workout-sessions/start"]["post"]["responses"]["201"]


def test_start_requires_explicit_protocol_version() -> None:
    body = {
        "session_id": str(uuid4()),
        "mutation_id": str(uuid4()),
        "started_at": "2026-10-08T12:30:00+00:00",
        "time_zone": "Europe/Madrid",
    }
    response = _client().post(
        "/workout-sessions/start",
        headers={"Authorization": "Bearer valid-token"},
        json=body,
    )
    assert response.status_code == 422
