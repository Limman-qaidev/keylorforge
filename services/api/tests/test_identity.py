"""Contract tests for caller-relative identity and profile endpoints."""

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from supabase_auth.errors import AuthApiError

from app.auth.dependencies import (
    get_database_session,
    get_supabase_admin_deletion_client,
)
from app.auth.jwt_verifier import (
    AuthenticatedPrincipal,
    AuthenticationError,
    JwksProviderUnavailableError,
)
from app.config import Settings
from app.identity import router as identity_router
from app.identity import service as identity_service
from app.identity.schemas import MeResponse, ProfileResponse, UpdateProfileRequest
from app.identity.supabase_admin import (
    SupabaseAdminClient,
    SupabaseAdminDeletionError,
)
from app.main import create_app


class _Verifier:
    def __init__(self, principal: AuthenticatedPrincipal) -> None:
        self._principal = principal

    def verify(self, token: str) -> AuthenticatedPrincipal:
        assert token == "valid-token"
        return self._principal


class _UnavailableVerifier:
    def verify(self, token: str) -> AuthenticatedPrincipal:
        raise JwksProviderUnavailableError("provider timed out")


class _InvalidVerifier:
    def verify(self, token: str) -> AuthenticatedPrincipal:
        raise AuthenticationError("invalid token")


def test_me_rejects_a_missing_bearer_token() -> None:
    client = TestClient(create_app())

    response = client.get("/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_rejects_a_malformed_bearer_header() -> None:
    client = TestClient(create_app())

    response = client.get("/me", headers={"Authorization": "Basic malformed"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_reports_jwks_provider_outage_as_retryable() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _UnavailableVerifier()
    client = TestClient(app)

    response = client.get("/me", headers={"Authorization": "Bearer valid-token"})

    assert response.status_code == 503
    assert response.json() == {"detail": "authentication is temporarily unavailable"}


def test_me_uses_the_authenticated_principal_not_a_client_identifier(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    caller_subject = uuid4()
    application_id = uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(AuthenticatedPrincipal(caller_subject))
    app.dependency_overrides[get_database_session] = lambda: iter((object(),))
    expected = MeResponse(
        id=application_id,
        profile=ProfileResponse(
            display_name=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
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
    assert response.json()["profile"]["display_name"] is None


def test_patch_my_profile_uses_only_the_authenticated_principal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    caller_subject = uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(AuthenticatedPrincipal(caller_subject))
    app.dependency_overrides[get_database_session] = lambda: iter((object(),))
    expected = ProfileResponse(
        display_name="Jonathan",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    def update_profile(
        *,
        principal: AuthenticatedPrincipal,
        session: object,
        update: UpdateProfileRequest,
    ) -> ProfileResponse:
        assert principal.external_subject == caller_subject
        assert update.display_name == "Jonathan"
        return expected

    monkeypatch.setattr(identity_router, "update_current_profile", update_profile)
    client = TestClient(app)

    response = client.patch(
        "/me/profile?user_id=another-user",
        headers={"Authorization": "Bearer valid-token"},
        json={"display_name": "  Jonathan  "},
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Jonathan"


@pytest.mark.parametrize(
    "payload",
    [
        {"display_name": "   "},
        {"display_name": "a" * 81},
        {"display_name": "A\u0000B"},
        {"display_name": "Jonathan", "user_id": str(uuid4())},
    ],
)
def test_patch_my_profile_rejects_invalid_or_owner_selecting_input(
    payload: dict[str, str],
) -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(AuthenticatedPrincipal(uuid4()))
    app.dependency_overrides[get_database_session] = lambda: iter((object(),))
    client = TestClient(app)

    response = client.patch(
        "/me/profile",
        headers={"Authorization": "Bearer valid-token"},
        json=payload,
    )

    assert response.status_code == 422


def test_patch_my_profile_reports_jwks_provider_outage_as_retryable() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _UnavailableVerifier()
    client = TestClient(app)

    response = client.patch(
        "/me/profile",
        headers={"Authorization": "Bearer valid-token"},
        json={"display_name": "Jonathan"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "authentication is temporarily unavailable"}


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Basic malformed"}],
)
def test_patch_my_profile_rejects_missing_or_malformed_bearer_token(
    headers: dict[str, str],
) -> None:
    client = TestClient(create_app())

    response = client.patch(
        "/me/profile", headers=headers, json={"display_name": "Name"}
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_patch_my_profile_rejects_an_invalid_bearer_token() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _InvalidVerifier()
    client = TestClient(app)

    response = client.patch(
        "/me/profile",
        headers={"Authorization": "Bearer invalid-token"},
        json={"display_name": "Name"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_patch_my_profile_preserves_terminal_identity_protection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _TerminalRepository:
        def __init__(self, session: Session) -> None:
            self._session = session

        def get_or_provision_active_user(self, **_: object) -> object:
            raise identity_service.TerminalIdentityError("terminal")

        def set_profile_display_name(self, **_: object) -> object:
            raise AssertionError("terminal identities must not be updated")

    monkeypatch.setattr(
        identity_service, "ApplicationUserRepository", _TerminalRepository
    )

    with pytest.raises(HTTPException) as raised:
        identity_service.update_current_profile(
            principal=AuthenticatedPrincipal(uuid4()),
            session=cast(Session, object()),
            update=UpdateProfileRequest(display_name="Jonathan"),
        )

    assert raised.value.status_code == status.HTTP_403_FORBIDDEN
    assert raised.value.detail == "not authorized"


def test_delete_me_uses_only_the_authenticated_principal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    caller_subject = uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(AuthenticatedPrincipal(caller_subject))
    app.dependency_overrides[get_database_session] = lambda: iter((object(),))
    app.dependency_overrides[get_supabase_admin_deletion_client] = lambda: object()

    def delete_identity(*, principal: AuthenticatedPrincipal, **_: object) -> None:
        assert principal.external_subject == caller_subject

    monkeypatch.setattr(identity_router, "delete_current_identity", delete_identity)
    response = TestClient(app).delete(
        f"/me?user_id={uuid4()}", headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == 204
    assert response.content == b""


def test_delete_me_missing_admin_configuration_does_not_mutate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(AuthenticatedPrincipal(uuid4()))
    monkeypatch.setattr(
        identity_router,
        "delete_current_identity",
        lambda **_: pytest.fail(
            "missing admin configuration must fail before mutation"
        ),
    )

    response = TestClient(app).delete(
        "/me", headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "account deletion is temporarily unavailable"}


def test_delete_service_commits_tombstone_before_provider_and_finalizes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    subject = uuid4()

    class _Repository:
        def __init__(self, session: object) -> None:
            pass

        def start_deletion(self, **_: object) -> None:
            events.append("prepared")

        def finalize_deletion(self, **_: object) -> None:
            events.append("finalized")

    class _Session:
        def commit(self) -> None:
            events.append("committed")

    class _Admin:
        def delete_user(self, external_subject: object) -> None:
            assert external_subject == subject
            assert events == ["prepared", "committed"]
            events.append("provider")

    monkeypatch.setattr(identity_service, "ApplicationUserRepository", _Repository)
    identity_service.delete_current_identity(
        principal=AuthenticatedPrincipal(subject),
        session=cast(Session, _Session()),
        admin_client=_Admin(),
    )

    assert events == ["prepared", "committed", "provider", "finalized", "committed"]


def test_delete_service_keeps_committed_tombstone_on_provider_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []

    class _Repository:
        def __init__(self, session: object) -> None:
            pass

        def start_deletion(self, **_: object) -> None:
            events.append("prepared")

        def finalize_deletion(self, **_: object) -> None:
            pytest.fail("provider failure must not finalize")

    class _Session:
        def commit(self) -> None:
            events.append("committed")

    class _Admin:
        def delete_user(self, external_subject: object) -> None:
            raise SupabaseAdminDeletionError

    monkeypatch.setattr(identity_service, "ApplicationUserRepository", _Repository)
    with pytest.raises(HTTPException) as raised:
        identity_service.delete_current_identity(
            principal=AuthenticatedPrincipal(uuid4()),
            session=cast(Session, _Session()),
            admin_client=_Admin(),
        )

    assert raised.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert events == ["prepared", "committed"]


def test_supabase_user_not_found_is_an_idempotent_deletion_success() -> None:
    subject = uuid4()

    class _Admin:
        def delete_user(self, user_id: str) -> None:
            assert user_id == str(subject)
            raise AuthApiError("not found", 404, "user_not_found")

    class _Client:
        auth = type("Auth", (), {"admin": _Admin()})()

    SupabaseAdminClient(cast(object, _Client())).delete_user(subject)


def test_supabase_provider_diagnostics_are_not_exposed() -> None:
    class _Admin:
        def delete_user(self, user_id: str) -> None:
            raise AuthApiError("provider diagnostic", 500, "unexpected_failure")

    class _Client:
        auth = type("Auth", (), {"admin": _Admin()})()

    with pytest.raises(SupabaseAdminDeletionError) as raised:
        SupabaseAdminClient(cast(object, _Client())).delete_user(uuid4())

    assert str(raised.value) == ""


def test_profile_endpoints_are_present_in_the_openapi_contract() -> None:
    schema = create_app().openapi()

    assert schema["paths"]["/me"]["get"]["responses"]["200"]
    patch_operation = schema["paths"]["/me/profile"]["patch"]
    assert patch_operation["responses"]["200"]
    assert "parameters" not in patch_operation
    request_schema = schema["components"]["schemas"]["UpdateProfileRequest"]
    assert request_schema["required"] == ["display_name"]
    assert request_schema["additionalProperties"] is False
    assert set(request_schema["properties"]) == {"display_name"}
    delete_operation = schema["paths"]["/me"]["delete"]
    assert delete_operation["responses"]["204"]
    assert "parameters" not in delete_operation
