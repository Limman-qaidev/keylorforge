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


@pytest.mark.parametrize(
    "boundary_instant",
    [
        "0001-01-01T00:00:00+14:00",
        "9999-12-31T23:59:59-14:00",
    ],
)
def test_confirmed_set_rejects_utc_overflow_before_any_database_access(
    boundary_instant: str,
) -> None:
    session_id = str(uuid4())
    request = {
        "protocol_version": 1,
        "kind": "CONFIRM_FIRST_SET_WITH_OCCURRENCE",
        "session_id": session_id,
        "mutation_id": str(uuid4()),
        "set_id": str(uuid4()),
        "occurrence_id": str(uuid4()),
        "canonical_exercise_id": str(uuid4()),
        "agenda_item_id": None,
        "actual_order": 0,
        "set_role": "WARMUP",
        "measurement": {"measurementType": "reps", "reps": 12},
        "load": None,
        "machine": None,
        "target_at_confirmation": None,
        "completed_at": boundary_instant,
    }
    response = _client().post(
        f"/workout-sessions/{session_id}/sets/first",
        headers={"Authorization": "Bearer valid-token"},
        json=request,
    )
    assert response.status_code == 422
