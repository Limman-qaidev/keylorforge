"""Fail-closed physical QA preflight: only a verified disposable database."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth.dependencies import get_authenticated_principal, get_database_session
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.config import Settings
from app.main import create_app


class FakeReadOnlySession:
    def __init__(self, database: str, exercises: int) -> None:
        self.database = database
        self.exercises = exercises

    def scalar(self, statement: object) -> str | int:
        if "current_database()" in str(statement):
            return self.database
        return self.exercises


def make_client(database: str, exercises: int) -> TestClient:
    app = create_app(Settings(environment="test"))
    app.dependency_overrides[get_authenticated_principal] = lambda: (
        AuthenticatedPrincipal(uuid4())
    )
    app.dependency_overrides[get_database_session] = lambda: FakeReadOnlySession(
        database, exercises
    )
    return TestClient(app)


def test_qa_route_not_exposed_outside_test_mode() -> None:
    app = create_app(Settings(environment="development"))
    assert TestClient(app).get("/_qa/m3-ready").status_code == 404

    app = create_app(Settings(environment="production"))
    assert TestClient(app).get("/_qa/m3-ready").status_code == 404


def test_qa_route_requires_authentication() -> None:
    app = create_app(Settings(environment="test"))
    assert TestClient(app).get("/_qa/m3-ready").status_code == 401


def test_qa_route_rejects_wrong_postgres_database() -> None:
    response = make_client("keylorforge", 899).get("/_qa/m3-ready")
    assert response.status_code == 409


def test_qa_route_rejects_empty_catalogue() -> None:
    response = make_client("keylorforge_m3_e2e", 0).get("/_qa/m3-ready")
    assert response.status_code == 409


def test_qa_route_accepts_only_prepared_isolated_database() -> None:
    response = make_client("keylorforge_m3_e2e", 899).get("/_qa/m3-ready")
    assert response.status_code == 200
    assert response.json() == {
        "ready": True,
        "database": "keylorforge_m3_e2e",
        "exercises": 899,
    }
