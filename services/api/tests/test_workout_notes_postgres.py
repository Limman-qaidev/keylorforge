"""Real PostgreSQL owner isolation and immutable note replay tests."""
from __future__ import annotations

import os
from datetime import UTC, datetime
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
    WorkoutExerciseNoteEvent,
    WorkoutOccurrence,
    WorkoutSession,
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


def test_real_postgres_exercise_notes_are_owner_scoped_and_append_only() -> None:
    url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if url is None:
        pytest.skip("real PostgreSQL test database is required")
    engine = create_engine(url)
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(uuid4(), uuid4())

    def database_session():
        with Session(engine) as db:
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise

    app.dependency_overrides[get_database_session] = database_session
    client = TestClient(app)
    a = {"Authorization": "Bearer owner-a"}
    b = {"Authorization": "Bearer owner-b"}
    try:
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            import_vendored_catalog(db, load_vendored_snapshot())
            exercise = db.scalar(
                select(CatalogExercise.id).where(
                    CatalogExercise.is_active.is_(True),
                    CatalogExercise.canonical_exercise_id.is_(None),
                    CatalogExercise.measurement_type
                    == ExerciseMeasurementType.REPS,
                ).limit(1)
            )
            assert exercise is not None
            db.commit()
        sid = str(uuid4())
        started = client.post(
            "/workout-sessions/start",
            headers=a,
            json={
                "protocol_version": 1,
                "session_id": sid,
                "mutation_id": str(uuid4()),
                "started_at": "2026-10-23T10:00:00+00:00",
                "time_zone": "Europe/Madrid",
            },
        )
        assert started.status_code == 201, started.text
        occurrence = str(uuid4())
        first = client.post(
            f"/workout-sessions/{sid}/sets/first",
            headers=a,
            json={
                "protocol_version": 1,
                "kind": "CONFIRM_FIRST_SET_WITH_OCCURRENCE",
                "session_id": sid,
                "mutation_id": str(uuid4()),
                "set_id": str(uuid4()),
                "occurrence_id": occurrence,
                "canonical_exercise_id": str(exercise),
                "agenda_item_id": None,
                "actual_order": 0,
                "set_role": "WORKING",
                "measurement": {"measurementType": "reps", "reps": 10},
                "load": {"decimal": "20", "unit": "kg", "entrySemantics": "total"},
                "machine": None,
                "target_at_confirmation": None,
                "completed_at": "2026-10-23T10:10:00+00:00",
            },
        )
        assert first.status_code == 201, first.text
        note = {
            "protocol_version": 1,
            "note_event_id": str(uuid4()),
            "session_id": sid,
            "occurrence_id": occurrence,
            "canonical_exercise_id": str(exercise),
            "body": "Buenas sensaciones",
            "created_at_utc": "2026-10-23T10:11:00+00:00",
        }
        endpoint = f"/workout-sessions/{sid}/notes"
        created = client.post(endpoint, headers=a, json=note)
        assert created.status_code == 201, created.text
        assert client.post(endpoint, headers=a, json=note).json() == created.json()
        assert client.get(endpoint, headers=b).status_code == 404
        assert client.get(
            f"/workout-sessions/exercise-notes/{exercise}", headers=b
        ).json()["items"] == []
        changed = dict(note, body="Overwritten")
        assert client.post(endpoint, headers=a, json=changed).status_code == 409
        other = dict(
            note,
            note_event_id=str(uuid4()),
            body="Más cómodo al segundo intento",
            created_at_utc="2026-10-23T10:12:00+00:00",
        )
        created2 = client.post(endpoint, headers=a, json=other)
        assert created2.status_code == 201, created2.text

        # Finished sessions remain commentable, without reopening or rewriting
        # any workout sets / completion snapshot.
        with Session(engine) as db:
            own = db.get(WorkoutSession, UUID(sid))
            assert own is not None
            own.lifecycle_state = "completed"
            db.commit()
        third = dict(
            note,
            note_event_id=str(uuid4()),
            body="Nota añadida tras finalizar",
            created_at_utc="2026-10-23T10:13:00+00:00",
        )
        assert client.post(endpoint, headers=a, json=third).status_code == 201
        history = client.get(
            f"/workout-sessions/exercise-notes/{exercise}", headers=a
        )
        assert history.status_code == 200, history.text
        assert [row["body"] for row in history.json()["items"]] == [
            third["body"], other["body"], note["body"]
        ]
        with Session(engine) as db:
            assert len(db.scalars(select(WorkoutExerciseNoteEvent)).all()) == 3
            assert len(db.scalars(select(WorkoutOccurrence)).all()) == 1
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
