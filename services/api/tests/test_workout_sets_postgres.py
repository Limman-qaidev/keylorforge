"""Real PostgreSQL first/additional performed-work and idempotent receipt tests."""

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
from keylorforge_database.identity import ApplicationUserRepository
from keylorforge_database.models import (
    AuthProvider,
    Base,
    CatalogExercise,
    ExerciseMeasurementType,
    WorkoutMutationReceipt,
    WorkoutOccurrence,
    WorkoutSession,
    WorkoutSet,
)
from keylorforge_database.workouts import purge_account_workout_data
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
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


def _set_payload(
    session_id: str,
    exercise_id: str,
    *,
    first: bool = True,
    occurrence_id: str | None = None,
    mutation_id: str | None = None,
    set_id: str | None = None,
) -> dict[str, object]:
    return {
        "protocol_version": 1,
        "kind": (
            "CONFIRM_FIRST_SET_WITH_OCCURRENCE" if first else "CONFIRM_ADDITIONAL_SET"
        ),
        "session_id": session_id,
        "mutation_id": mutation_id or str(uuid4()),
        "set_id": set_id or str(uuid4()),
        "occurrence_id": occurrence_id or str(uuid4()),
        "canonical_exercise_id": exercise_id,
        "agenda_item_id": None,
        "actual_order": 0,
        "set_role": "WARMUP" if first else "WORKING",
        "measurement": {"measurementType": "reps", "reps": 12 if first else 8},
        "load": {
            "decimal": "20.5" if first else "27.5",
            "unit": "kg" if first else "lb",
            "entrySemantics": "total",
        },
        "machine": None,
        "target_at_confirmation": None,
        "completed_at": "2026-10-08T14:45:00+00:00",
    }


def test_real_postgres_confirmations_are_owner_scoped_atomic_and_idempotent() -> None:
    url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if url is None:
        pytest.skip("KEYLORFORGE_TEST_DATABASE_URL required for real PostgreSQL")
    engine = create_engine(url)
    subject_a, subject_b = uuid4(), uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(subject_a, subject_b)

    def database_session():
        with Session(engine) as session:
            try:
                yield session
                session.commit()
            except BaseException:
                session.rollback()
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
        workout_start = {
            "protocol_version": 1,
            "session_id": str(uuid4()),
            "mutation_id": str(uuid4()),
            "started_at": "2026-10-08T14:30:00+00:00",
            "time_zone": "Europe/Madrid",
        }
        created = client.post("/workout-sessions/start", headers=a, json=workout_start)
        assert created.status_code == 201, created.text
        path = f"/workout-sessions/{workout_start['session_id']}/sets"
        first = _set_payload(workout_start["session_id"], str(exercise_id))
        confirmed = client.post(f"{path}/first", headers=a, json=first)
        assert confirmed.status_code == 201, confirmed.text
        assert confirmed.json()["set_role"] == "WARMUP"
        assert confirmed.json()["load_decimal"] == "20.5"
        assert confirmed.json()["load_unit"] == "kg"

        replay = client.post(f"{path}/first", headers=a, json=first)
        assert replay.status_code == 201
        assert replay.json() == confirmed.json()

        # Identical semantic retry with a reordered measurement object is safe.
        reordered = deepcopy(first)
        reordered["measurement"] = {"reps": 12, "measurementType": "reps"}
        assert (
            client.post(f"{path}/first", headers=a, json=reordered).json()
            == confirmed.json()
        )

        # Unverified target snapshots must not bypass the agenda fence.
        unbound_target = deepcopy(first)
        unbound_target["mutation_id"] = str(uuid4())
        unbound_target["set_id"] = str(uuid4())
        unbound_target["target_at_confirmation"] = {"target": {"reps": 12}}
        assert (
            client.post(f"{path}/first", headers=a, json=unbound_target).status_code
            == 409
        )

        tampered = deepcopy(first)
        tampered["measurement"]["reps"] = 15
        assert client.post(f"{path}/first", headers=a, json=tampered).status_code == 409

        other_account = client.post(f"{path}/first", headers=b, json=first)
        assert other_account.status_code == 404

        additional = _set_payload(
            workout_start["session_id"],
            str(exercise_id),
            first=False,
            occurrence_id=first["occurrence_id"],
        )
        second = client.post(f"{path}/additional", headers=a, json=additional)
        assert second.status_code == 201, second.text
        assert second.json()["set_role"] == "WORKING"
        assert second.json()["load_unit"] == "lb"

        mismatch = deepcopy(additional)
        mismatch["mutation_id"] = str(uuid4())
        mismatch["actual_order"] = 5
        assert (
            client.post(f"{path}/additional", headers=a, json=mismatch).status_code
            == 409
        )
        assert (
            client.post(f"{path}/additional", headers=b, json=additional).status_code
            == 404
        )

        missing = deepcopy(additional)
        missing["mutation_id"] = str(uuid4())
        missing["occurrence_id"] = str(uuid4())
        # Isolate missing-parent error from a duplicate set-ID conflict.
        missing["set_id"] = str(uuid4())
        assert (
            client.post(f"{path}/additional", headers=a, json=missing).status_code
            == 404
        )

        blocked_machine = deepcopy(additional)
        blocked_machine["mutation_id"] = str(uuid4())
        blocked_machine["machine"] = {
            "profileId": str(uuid4()),
            "configurationId": None,
            "snapshot": {"label": "Unknown pulley"},
        }
        assert (
            client.post(
                f"{path}/additional", headers=a, json=blocked_machine
            ).status_code
            == 409
        )
        unknown_agenda = deepcopy(additional)
        unknown_agenda["mutation_id"] = str(uuid4())
        unknown_agenda["agenda_item_id"] = str(uuid4())
        assert (
            client.post(
                f"{path}/additional", headers=a, json=unknown_agenda
            ).status_code
            == 409
        )

        # The canonical catalogue exercise is measured in repetitions.
        # Internal measurement shape validity alone is insufficient.
        incompatible_time = deepcopy(additional)
        incompatible_time["mutation_id"] = str(uuid4())
        incompatible_time["set_id"] = str(uuid4())
        incompatible_time["measurement"] = {
            "measurementType": "time", "durationSeconds": 30
        }
        assert (
            client.post(
                f"{path}/additional", headers=a, json=incompatible_time
            ).status_code
            == 422
        )
        incompatible_distance = deepcopy(additional)
        incompatible_distance["mutation_id"] = str(uuid4())
        incompatible_distance["set_id"] = str(uuid4())
        incompatible_distance["measurement"] = {
            "measurementType": "distance",
            "distanceDecimal": "35.5",
            "distanceUnit": "m",
        }
        assert (
            client.post(
                f"{path}/additional", headers=a, json=incompatible_distance
            ).status_code
            == 422
        )

        invalid = deepcopy(additional)
        invalid["mutation_id"] = str(uuid4())
        invalid["measurement"] = {
            "measurementType": "distance",
            "distanceDecimal": "0",
            "distanceUnit": "km",
        }
        assert (
            client.post(f"{path}/additional", headers=a, json=invalid).status_code
            == 422
        )

        with Session(engine) as db:
            occurrences = db.scalars(select(WorkoutOccurrence)).all()
            sets = db.scalars(select(WorkoutSet)).all()
            receipts = db.scalars(select(WorkoutMutationReceipt)).all()
            assert len(occurrences) == 1
            assert len(sets) == 2
            assert len(receipts) == 3  # START + WARMUP + WORKING.
            assert occurrences[0].first_set_id == UUID(first["set_id"])
            assert sets[0].occurrence_id == sets[1].occurrence_id
            assert {(row.set_role, row.load_unit) for row in sets} == {
                ("WARMUP", "kg"),
                ("WORKING", "lb"),
            }
        # A malformed direct DB insert must not commit an orphan occurrence
        # even if it bypasses the authorized API service.
        with Session(engine) as db:
            owner = ApplicationUserRepository(db).get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE,
                external_subject=subject_a,
            )
            bad_occurrence_id = uuid4()
            db.add(
                WorkoutOccurrence(
                    id=bad_occurrence_id,
                    owner_user_id=owner.id,
                    session_id=UUID(workout_start["session_id"]),
                    canonical_exercise_id=exercise_id,
                    agenda_item_id=None,
                    actual_order=1,
                    first_set_id=uuid4(),
                )
            )
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()
            assert db.get(WorkoutOccurrence, bad_occurrence_id) is None

            # Full owner purge must remove sets before the occurrence,
            # mutation receipts before session, satisfying all FKs.
            purge_account_workout_data(db, owner.id)
            db.commit()
            assert db.scalars(select(WorkoutOccurrence)).all() == []
            assert db.scalars(select(WorkoutSet)).all() == []
            assert db.scalars(select(WorkoutMutationReceipt)).all() == []
            assert db.scalars(select(WorkoutSession)).all() == []
    finally:
        engine.dispose()
