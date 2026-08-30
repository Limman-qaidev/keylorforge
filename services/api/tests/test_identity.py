"""Contract tests for the caller-relative identity endpoint."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth.dependencies import get_database_session
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.config import Settings
from app.identity import router as identity_router
from app.identity.schemas import MeResponse, ProfileFoundationResponse
from app.main import create_app


class _Verifier:
    def __init__(self, principal: AuthenticatedPrincipal) -> None:
        self._principal = principal

    def verify(self, token: str) -> AuthenticatedPrincipal:
        assert token == "valid-token"
        return self._principal


def test_me_rejects_a_missing_bearer_token() -> None:
    client = TestClient(create_app())

    response = client.get("/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_uses_the_authenticated_principal_not_a_client_identifier(
    monkeypatch,
) -> None:
    caller_subject = uuid4()
    application_id = uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(AuthenticatedPrincipal(caller_subject))
    app.dependency_overrides[get_database_session] = lambda: iter((object(),))
    expected = MeResponse(
        id=application_id,
        profile=ProfileFoundationResponse(
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC)
        ),
    )

    def current_identity(
        *, principal: AuthenticatedPrincipal, session: object
    ) -> MeResponse:
        assert principal.external_subject == caller_subject
        return expected

    monkeypatch.setattr(
        identity_router, "get_or_provision_current_identity", current_identity
    )
    client = TestClient(app)

    response = client.get(
        "/me?user_id=another-user", headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(application_id)


def test_me_is_present_in_the_openapi_contract() -> None:
    schema = create_app().openapi()

    assert schema["paths"]["/me"]["get"]["responses"]["200"]
