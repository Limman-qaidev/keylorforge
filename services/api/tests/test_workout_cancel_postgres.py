"""Real PostgreSQL cancellation, retry, owner isolation and set retention."""

from __future__ import annotations

import os
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from keylorforge_database.catalog_importer import (
    import_vendored_catalog,
    load_vendored_snapshot,
)
from keylorforge_database.models import (
    Base,
    CatalogExercise,
    ExerciseMeasurementType,
    WorkoutMutationReceipt,
    WorkoutSession,
    WorkoutSet,
)
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_database_session
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.config import Settings
from app.main import create_app


class _Verifier:
    def __init__(self, a: UUID, b: UUID) -> None:
        self._subjects = {"owner-a": a, "owner-b": b}

    def verify(self, token: str) -> AuthenticatedPrincipal:
        return AuthenticatedPrincipal(self._subjects[token])


def _cancel(session_id: str, count: int = 0, *, discard: bool = False) -> dict:
    return {
        "protocol_version": 1,
        "kind": "CANCEL_SESSION",
        "session_id": session_id,
        "mutation_id": str(uuid4()),
        "cancelled_at_utc": "2026-10-08T15:00:00+00:00",
        "confirmed_set_count": count,
        "discard_performed_sets_confirmed": discard,
    }


def _start(client: TestClient, headers: dict[str, str]) -> str:
    sid = str(uuid4())
    response = client.post(
        "/workout-sessions/start",
        headers=headers,
        json={
            "protocol_version": 1,
            "session_id": sid,
            "mutation_id": str(uuid4()),
            "started_at": "2026-10-08T14:30:00+00:00",
            "time_zone": "Europe/Madrid",
        },
    )
    assert response.status_code == 201, response.text
    return sid


def test_cancel_is_atomic_owner_scoped_and_preserves_sets() -> None:
    url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if url is None:
        pytest.skip("real PostgreSQL test URL required")
    engine = create_engine(url)
    a_subject, b_subject = uuid4(), uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(a_subject, b_subject)

    def db_session():
        with Session(engine) as db:
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise

    app.dependency_overrides[get_database_session] = db_session
    client = TestClient(app)
    a = {"Authorization": "Bearer owner-a"}
    b = {"Authorization": "Bearer owner-b"}
    try:
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            import_vendored_catalog(db, load_vendored_snapshot())
            exercise = db.scalar(
                select(CatalogExercise.id)
                .where(
                    CatalogExercise.is_active.is_(True),
                    CatalogExercise.canonical_exercise_id.is_(None),
                    CatalogExercise.measurement_type == ExerciseMeasurementType.REPS,
                )
                .limit(1)
            )
            assert exercise is not None
            db.commit()

        # Zero-set cancellation: session tombstone and idempotent receipt,
        # no completed history, no automatic loss of START mutation receipt.
        empty = _start(client, a)
        endpoint = f"/workout-sessions/{empty}/cancel"
        intent = _cancel(empty)
        assert client.post(endpoint, headers=b, json=intent).status_code == 404
        assert (
            client.post(
                endpoint, headers=a, json={**intent, "session_id": str(uuid4())}
            ).status_code
            == 422
        )
        first = client.post(endpoint, headers=a, json=intent)
        assert first.status_code == 201, first.text
        assert first.json()["lifecycle_state"] == "cancelled"
        assert first.json()["confirmed_set_count"] == 0
        replay = client.post(endpoint, headers=a, json=intent)
        assert replay.status_code == 201 and replay.json() == first.json()
        stale = {**intent, "cancelled_at_utc": "2026-10-08T15:01:00+00:00"}
        assert client.post(endpoint, headers=a, json=stale).status_code == 409
        assert client.post(endpoint, headers=a, json=_cancel(empty)).status_code == 409
        assert client.get("/workout-sessions/active", headers=a).json() is None

        # A completed set is never deleted on cancellation. The server
        # requires the client's exact authoritative count AND explicit warning.
        worked = _start(client, a)
        set_id = str(uuid4())
        sets_response = client.post(
            f"/workout-sessions/{worked}/sets/first",
            headers=a,
            json={
                "protocol_version": 1,
                "kind": "CONFIRM_FIRST_SET_WITH_OCCURRENCE",
                "session_id": worked,
                "mutation_id": str(uuid4()),
                "set_id": set_id,
                "occurrence_id": str(uuid4()),
                "canonical_exercise_id": str(exercise),
                "agenda_item_id": None,
                "actual_order": 0,
                "set_role": "WORKING",
                "measurement": {"measurementType": "reps", "reps": 8},
                "load": None,
                "machine": None,
                "target_at_confirmation": None,
                "completed_at": "2026-10-08T14:45:00+00:00",
            },
        )
        assert sets_response.status_code == 201, sets_response.text
        endpoint = f"/workout-sessions/{worked}/cancel"
        assert client.post(endpoint, headers=a, json=_cancel(worked)).status_code == 409
        assert (
            client.post(endpoint, headers=a, json=_cancel(worked, 1)).status_code == 422
        )
        assert (
            client.post(
                endpoint,
                headers=a,
                json={
                    **_cancel(worked, 1, discard=True),
                    "cancelled_at_utc": "2026-10-08T14:35:00+00:00",
                },
            ).status_code
            == 422
        )

        cancelled = client.post(
            endpoint, headers=a, json=_cancel(worked, 1, discard=True)
        )
        assert cancelled.status_code == 201, cancelled.text
        assert cancelled.json()["confirmed_set_count"] == 1
        assert (
            client.post(
                endpoint, headers=b, json=_cancel(worked, 1, discard=True)
            ).status_code
            == 404
        )
        with Session(engine) as db:
            assert db.get(WorkoutSession, UUID(worked)).lifecycle_state == "cancelled"
            assert db.get(WorkoutSession, UUID(empty)).lifecycle_state == "cancelled"
            assert db.get(WorkoutSet, UUID(set_id)) is not None
            # 2 start + cancel for empty; start + first set + cancel for worked.
            assert len(db.scalars(select(WorkoutMutationReceipt)).all()) == 5
    finally:
        engine.dispose()
