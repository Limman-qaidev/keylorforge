"""Real PostgreSQL FINISH: qualification, idempotency and owner isolation."""

from __future__ import annotations

import os
from copy import deepcopy
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
    WorkoutCompletionSnapshot,
    WorkoutMutationReceipt,
    WorkoutSession,
    WorkoutSet,
)
from keylorforge_database.workouts import purge_account_workout_data
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_database_session
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.config import Settings
from app.main import create_app


class _Verifier:
    def __init__(self, owner_a: UUID, owner_b: UUID) -> None:
        self.subjects = {"owner-a": owner_a, "owner-b": owner_b}

    def verify(self, token: str) -> AuthenticatedPrincipal:
        return AuthenticatedPrincipal(self.subjects[token])


def _first_set(
    session_id: str,
    exercise_id: str,
    occurrence_id: str,
    mutation_id: str,
    set_id: str,
    *,
    warmup: bool,
) -> dict[str, object]:
    kind = "CONFIRM_FIRST_SET_WITH_OCCURRENCE" if warmup else "CONFIRM_ADDITIONAL_SET"
    return {
        "protocol_version": 1,
        "kind": kind,
        "session_id": session_id,
        "mutation_id": mutation_id,
        "set_id": set_id,
        "occurrence_id": occurrence_id,
        "canonical_exercise_id": exercise_id,
        "agenda_item_id": None,
        "actual_order": 0,
        "set_role": "WARMUP" if warmup else "WORKING",
        "measurement": {"measurementType": "reps", "reps": 12 if warmup else 8},
        "load": None,
        "machine": None,
        "target_at_confirmation": None,
        "completed_at": "2026-10-08T14:45:00+00:00",
    }


def _finish(
    session_id: str,
    occurrence_id: str,
    exercise_id: str,
    set_ids: list[str],
) -> dict[str, object]:
    return {
        "protocol_version": 1,
        "kind": "FINISH_SESSION",
        "session_id": session_id,
        "mutation_id": str(uuid4()),
        "completion_snapshot": {
            "schema_version": 1,
            "completion_snapshot_id": str(uuid4()),
            "session_id": session_id,
            "origin": "free",
            "original_agenda": {
                "schema_version": 1,
                "origin": "free",
                "items": [],
            },
            "final_agenda_revision": 0,
            "applied_agenda_change_ids": [],
            "agenda_items": [],
            "unplanned_performed_occurrences": [
                {
                    "occurrence_id": occurrence_id,
                    "canonical_exercise_id": exercise_id,
                    "actual_order": 0,
                    "agenda_item_id": None,
                    "set_ids": set_ids,
                }
            ],
            "finished_at_utc": "2026-10-08T15:00:00+00:00",
            "time_zone": "Europe/Madrid",
            "local_date": "2026-10-08",
        },
    }


def test_postgres_finish_is_atomic_idempotent_and_owner_scoped() -> None:
    url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if url is None:
        pytest.skip("real PostgreSQL integration URL required")
    engine = create_engine(url)
    owner_a, owner_b = uuid4(), uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(owner_a, owner_b)

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
            exercise_id = db.scalar(
                select(CatalogExercise.id)
                .where(
                    CatalogExercise.is_active.is_(True),
                    CatalogExercise.canonical_exercise_id.is_(None),
                    CatalogExercise.measurement_type == ExerciseMeasurementType.REPS,
                )
                .limit(1)
            )
            assert exercise_id is not None
            db.commit()

        workout_id = str(uuid4())
        started = client.post(
            "/workout-sessions/start",
            headers=a,
            json={
                "protocol_version": 1,
                "session_id": workout_id,
                "mutation_id": str(uuid4()),
                "started_at": "2026-10-08T14:30:00+00:00",
                "time_zone": "Europe/Madrid",
            },
        )
        assert started.status_code == 201, started.text
        occurrence = str(uuid4())
        warmup_id, working_id = str(uuid4()), str(uuid4())
        sets_path = f"/workout-sessions/{workout_id}/sets"
        warmup = _first_set(
            workout_id,
            str(exercise_id),
            occurrence,
            str(uuid4()),
            warmup_id,
            warmup=True,
        )
        first = client.post(f"{sets_path}/first", headers=a, json=warmup)
        assert first.status_code == 201, first.text

        command = _finish(workout_id, occurrence, str(exercise_id), [warmup_id])
        finish_url = f"/workout-sessions/{workout_id}/finish"
        assert client.post(finish_url, headers=a, json=command).status_code == 422
        with Session(engine) as db:
            assert db.scalar(select(WorkoutCompletionSnapshot.id)) is None
            assert db.get(WorkoutSession, UUID(workout_id)).lifecycle_state == "active"

        additional = _first_set(
            workout_id,
            str(exercise_id),
            occurrence,
            str(uuid4()),
            working_id,
            warmup=False,
        )
        second = client.post(f"{sets_path}/additional", headers=a, json=additional)
        assert second.status_code == 201, second.text

        # Server canonical order is completed_at and then UUID, not client UI order.
        command = _finish(
            workout_id, occurrence, str(exercise_id), sorted([warmup_id, working_id])
        )
        assert client.post(finish_url, headers=b, json=command).status_code == 404
        mismatch = {**command, "session_id": str(uuid4())}
        assert client.post(finish_url, headers=a, json=mismatch).status_code == 422

        missing = deepcopy(command)
        missing["mutation_id"] = str(uuid4())
        missing_item = missing["completion_snapshot"][
            "unplanned_performed_occurrences"
        ][0]
        missing_item["set_ids"] = [warmup_id]
        assert client.post(finish_url, headers=a, json=missing).status_code == 409

        too_early = deepcopy(command)
        too_early["mutation_id"] = str(uuid4())
        too_early["completion_snapshot"]["finished_at_utc"] = (
            "2026-10-08T14:00:00+00:00"
        )
        assert client.post(finish_url, headers=a, json=too_early).status_code == 422

        invalid_agenda = deepcopy(command)
        invalid_agenda["completion_snapshot"]["agenda_items"] = [{"fake": True}]
        assert (
            client.post(finish_url, headers=a, json=invalid_agenda).status_code == 422
        )

        finished = client.post(finish_url, headers=a, json=command)
        assert finished.status_code == 201, finished.text
        assert finished.json()["lifecycle_state"] == "completed"
        lifecycle_url = f"/workout-sessions/{workout_id}/lifecycle-state"
        current = client.get(lifecycle_url, headers=a)
        assert current.status_code == 200, current.text
        assert current.json() == {
            "session_id": workout_id,
            "lifecycle_state": "completed",
            "completion_snapshot_id": command["completion_snapshot"][
                "completion_snapshot_id"
            ],
        }
        assert client.get(lifecycle_url, headers=b).status_code == 404
        assert (
            finished.json()["completion_snapshot_id"]
            == (command["completion_snapshot"]["completion_snapshot_id"])
        )
        replay = client.post(finish_url, headers=a, json=command)
        assert replay.status_code == 201 and replay.json() == finished.json()
        changed = deepcopy(command)
        changed["completion_snapshot"]["finished_at_utc"] = "2026-10-08T15:15:00+00:00"
        assert client.post(finish_url, headers=a, json=changed).status_code == 409
        fresh_id = deepcopy(command)
        fresh_id["mutation_id"] = str(uuid4())
        assert client.post(finish_url, headers=a, json=fresh_id).status_code == 409
        attempted_set = {
            **additional,
            "set_id": str(uuid4()),
            "mutation_id": str(uuid4()),
        }
        assert (
            client.post(
                f"{sets_path}/additional", headers=a, json=attempted_set
            ).status_code
            == 409
        )

        with Session(engine) as db:
            completed = db.get(WorkoutSession, UUID(workout_id))
            assert completed.lifecycle_state == "completed"
            rows = db.scalars(select(WorkoutCompletionSnapshot)).all()
            assert len(rows) == 1
            assert rows[0].final_agenda["unplanned_performed_occurrences"][0][
                "set_ids"
            ] == sorted([warmup_id, working_id])
            assert len(db.scalars(select(WorkoutSet)).all()) == 2
            assert len(db.scalars(select(WorkoutMutationReceipt)).all()) == 4
            # Authoritative read path: only committed snapshots are returned.
            first_history = client.get("/workout-sessions/history", headers=a)
            assert first_history.status_code == 200, first_history.text
            first_entry = first_history.json()["entries"][0]
            assert first_entry["session_id"] == workout_id
            expected_snapshot_id = command["completion_snapshot"][
                "completion_snapshot_id"
            ]
            assert first_entry["completion_snapshot_id"] == expected_snapshot_id
            assert first_entry["finish_mutation_id"] == command["mutation_id"]
            assert first_entry["total_sets"] == 2
            assert first_entry["working_sets"] == 1
            performed = first_entry["completion_snapshot"][
                "unplanned_performed_occurrences"
            ]
            assert set(performed[0]["set_ids"]) == {warmup_id, working_id}
            # Recovery preparation: full authoritative native set details.
            # This is READ ONLY and cannot fabricate a local ACK/import.
            detail_url = f"/workout-sessions/{workout_id}/history-detail"
            detail = client.get(detail_url, headers=a)
            assert detail.status_code == 200, detail.text
            actual = detail.json()
            assert actual["session_id"] == workout_id
            assert actual["completion_snapshot_id"] == expected_snapshot_id
            assert actual["finish_mutation_id"] == command["mutation_id"]
            assert actual["lifecycle_state"] == "completed"
            assert len(actual["occurrences"]) == 1
            imported_occurrence = actual["occurrences"][0]
            assert imported_occurrence["occurrence_id"] == occurrence
            assert imported_occurrence["canonical_exercise_id"] == str(exercise_id)
            assert imported_occurrence["first_set_id"] == warmup_id
            imported_sets = imported_occurrence["sets"]
            assert {entry["set_id"] for entry in imported_sets} == {
                warmup_id,
                working_id,
            }
            assert {entry["set_role"] for entry in imported_sets} == {
                "WARMUP",
                "WORKING",
            }
            assert all(entry["measurement_type"] == "reps" for entry in imported_sets)
            assert all(entry["reps"] in (8, 12) for entry in imported_sets)
            assert all(entry["mutation_id"] for entry in imported_sets)
            assert all(entry["load_decimal"] is None for entry in imported_sets)
            assert "owner_user_id" not in actual
            assert "owner_user_id" not in imported_occurrence
            assert "owner_user_id" not in imported_sets[0]
            assert client.get(detail_url, headers=b).status_code == 404
            assert (
                client.get(
                    f"/workout-sessions/{uuid4()}/history-detail", headers=a
                ).status_code
                == 404
            )
            assert "owner_user_id" not in first_entry
            other_history = client.get("/workout-sessions/history", headers=b)
            assert other_history.status_code == 200
            assert other_history.json()["entries"] == []
            invalid_limit = client.get("/workout-sessions/history?limit=0", headers=a)
            assert invalid_limit.status_code == 422
            bad_id_cursor = client.get(
                "/workout-sessions/history?before_session_id=" + workout_id,
                headers=a,
            )
            assert bad_id_cursor.status_code == 422
            bad_date_cursor = client.get(
                "/workout-sessions/history?before_finished_at=2026-10-08T15:00:00",
                headers=a,
            )
            assert bad_date_cursor.status_code == 422

            # Two distinct completed sessions have an identical finish timestamp.
            # The stable keyset cursor must include the UUID tie-breaker.
            second_workout_id, second_occurrence_id = str(uuid4()), str(uuid4())
            second_set_id = str(uuid4())
            second_started = client.post(
                "/workout-sessions/start",
                headers=a,
                json={
                    "protocol_version": 1,
                    "session_id": second_workout_id,
                    "mutation_id": str(uuid4()),
                    "started_at": "2026-10-08T14:30:00+00:00",
                    "time_zone": "Europe/Madrid",
                },
            )
            assert second_started.status_code == 201, second_started.text
            second_first = _first_set(
                second_workout_id,
                str(exercise_id),
                second_occurrence_id,
                str(uuid4()),
                second_set_id,
                warmup=True,
            )
            second_first["set_role"] = "WORKING"
            second_first_response = client.post(
                f"/workout-sessions/{second_workout_id}/sets/first",
                headers=a,
                json=second_first,
            )
            assert second_first_response.status_code == 201
            second_finish = _finish(
                second_workout_id,
                second_occurrence_id,
                str(exercise_id),
                [second_set_id],
            )
            second_finish_response = client.post(
                f"/workout-sessions/{second_workout_id}/finish",
                headers=a,
                json=second_finish,
            )
            assert second_finish_response.status_code == 201

            first_page = client.get(
                "/workout-sessions/history", headers=a, params={"limit": 1}
            )
            assert first_page.status_code == 200, first_page.text
            page_data = first_page.json()
            assert len(page_data["entries"]) == 1
            assert page_data["next_before_finished_at"] is not None
            assert page_data["next_before_session_id"] is not None
            second_page = client.get(
                "/workout-sessions/history",
                headers=a,
                params={
                    "limit": 1,
                    "before_finished_at": page_data["next_before_finished_at"],
                    "before_session_id": page_data["next_before_session_id"],
                },
            )
            assert second_page.status_code == 200, second_page.text
            assert len(second_page.json()["entries"]) == 1
            assert second_page.json()["next_before_finished_at"] is None
            assert second_page.json()["next_before_session_id"] is None
            assert {
                page_data["entries"][0]["session_id"],
                second_page.json()["entries"][0]["session_id"],
            } == {workout_id, second_workout_id}
            other_after_second = client.get("/workout-sessions/history", headers=b)
            assert other_after_second.json()["entries"] == []

            # Deletion executor must delete final snapshots before their session.
            purge_account_workout_data(db, rows[0].owner_user_id)
            db.commit()
            assert db.scalars(select(WorkoutCompletionSnapshot)).all() == []
            assert db.scalars(select(WorkoutSession)).all() == []
    finally:
        engine.dispose()
