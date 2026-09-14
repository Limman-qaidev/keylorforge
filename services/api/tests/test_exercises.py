"""HTTP contracts for the authenticated read-only catalogue API."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from keylorforge_database.identity import (
    ApplicationUserRepository,
    TerminalIdentityError,
)

from app.auth.dependencies import (
    get_database_session,
    require_active_application_user,
)
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.config import Settings
from app.exercises import router as exercises_router
from app.exercises.repository import _literal_substring
from app.exercises.schemas import (
    CatalogueReference,
    ExerciseDetail,
    ExerciseListItem,
    ExerciseMuscleReference,
    ExercisePage,
)
from app.main import create_app


class _Verifier:
    def verify(self, token: str) -> AuthenticatedPrincipal:
        assert token == "valid-token"
        return AuthenticatedPrincipal(uuid4())


def _client(*, enforce_lifecycle: bool = False) -> TestClient:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier()
    app.dependency_overrides[get_database_session] = lambda: iter((object(),))
    if not enforce_lifecycle:
        app.dependency_overrides[require_active_application_user] = lambda: None
    return TestClient(app)


def _item(exercise_id: UUID | None = None) -> ExerciseListItem:
    return ExerciseListItem(
        id=exercise_id or uuid4(),
        name="Sentadilla",
        measurement_type="reps",
        difficulty_level="beginner",
        category="strength",
        primary_muscles=[CatalogueReference(id=uuid4(), name="Cuádriceps")],
        equipment=[CatalogueReference(id=uuid4(), name="Barra")],
    )


@pytest.mark.parametrize(
    "path", ["/exercises", f"/exercises/{uuid4()}", "/muscles", "/equipment"]
)
def test_catalogue_routes_require_authentication(path: str) -> None:
    response = TestClient(create_app()).get(path)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "path", ["/exercises", f"/exercises/{uuid4()}", "/muscles", "/equipment"]
)
def test_catalogue_routes_reject_terminal_identity(
    path: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    def reject_terminal_identity(
        self: ApplicationUserRepository, **_: object
    ) -> None:
        raise TerminalIdentityError("terminal identity")

    monkeypatch.setattr(
        ApplicationUserRepository,
        "get_or_provision_active_user",
        reject_terminal_identity,
    )
    response = _client(enforce_lifecycle=True).get(
        path, headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "not authorized"}


def test_exercises_default_to_spanish_and_forward_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def list_catalogue(**kwargs: object) -> ExercisePage:
        captured.update(kwargs)
        return ExercisePage(
            items=[_item()], page=1, page_size=30, total=1, total_pages=1
        )

    monkeypatch.setattr(exercises_router, "list_exercises", list_catalogue)
    muscle_id = uuid4()
    equipment_id = uuid4()
    response = _client().get(
        "/exercises",
        params={
            "search": "sentad",
            "primary_muscle_id": str(muscle_id),
            "equipment_id": str(equipment_id),
        },
        headers={"Authorization": "Bearer valid-token"},
    )

    assert response.status_code == 200
    assert captured["locale"] == "es"
    assert captured["search"] == "sentad"
    assert captured["primary_muscle_id"] == muscle_id
    assert captured["equipment_id"] == equipment_id
    assert captured["page"] == 1
    assert captured["page_size"] == 30
    assert response.json()["items"][0]["name"] == "Sentadilla"


def test_exercises_accept_english_locale_and_validate_query_parameters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        exercises_router,
        "list_exercises",
        lambda **kwargs: ExercisePage(
            items=[],
            page=kwargs["page"],
            page_size=kwargs["page_size"],
            total=0,
            total_pages=0,
        ),
    )
    client = _client()
    headers = {"Authorization": "Bearer valid-token"}

    assert (
        client.get(
            "/exercises?locale=en&page=2&page_size=100", headers=headers
        ).status_code
        == 200
    )
    assert client.get("/exercises?locale=fr", headers=headers).status_code == 422
    assert client.get("/exercises?page=0", headers=headers).status_code == 422
    assert client.get("/exercises?page_size=101", headers=headers).status_code == 422
    assert (
        client.get(
            "/exercises?primary_muscle_id=not-a-uuid", headers=headers
        ).status_code
        == 422
    )


def test_detail_uses_localized_contract_and_maps_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exercise_id = uuid4()
    item = _item(exercise_id)
    detail = ExerciseDetail(
        **item.model_dump(),
        force_type="push",
        mechanics="compound",
        muscles=[
            ExerciseMuscleReference(
                id=item.primary_muscles[0].id, name="Cuádriceps", role="primary"
            )
        ],
    )
    monkeypatch.setattr(exercises_router, "get_exercise", lambda **_: detail)
    response = _client().get(
        f"/exercises/{exercise_id}", headers={"Authorization": "Bearer valid-token"}
    )

    assert response.status_code == 200
    assert set(response.json()) == {
        "id",
        "name",
        "measurement_type",
        "difficulty_level",
        "category",
        "primary_muscles",
        "equipment",
        "force_type",
        "mechanics",
        "muscles",
    }
    assert "source" not in response.json()
    assert "source_id" not in response.json()
    assert "instructions" not in response.json()

    monkeypatch.setattr(
        exercises_router,
        "get_exercise",
        lambda **_: (_ for _ in ()).throw(
            HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="exercise not found"
            )
        ),
    )
    not_found = _client().get(
        f"/exercises/{uuid4()}", headers={"Authorization": "Bearer valid-token"}
    )
    assert not_found.status_code == 404


def test_muscles_and_equipment_are_localized_and_present_in_openapi(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reference = CatalogueReference(id=uuid4(), name="Mancuerna")
    monkeypatch.setattr(exercises_router, "list_muscles", lambda **_: [reference])
    monkeypatch.setattr(exercises_router, "list_equipment", lambda **_: [reference])
    client = _client()
    headers = {"Authorization": "Bearer valid-token"}

    assert client.get("/muscles?locale=en", headers=headers).json() == [
        {"id": str(reference.id), "name": "Mancuerna"}
    ]
    assert client.get("/equipment", headers=headers).status_code == 200
    schema = create_app().openapi()
    assert set(
        ("/exercises", "/exercises/{exercise_id}", "/muscles", "/equipment")
    ) <= set(schema["paths"])


def test_search_text_is_escaped_as_a_literal_ilike_substring() -> None:
    assert _literal_substring(r"50%_\\done") == r"%50\%\_\\\\done%"
