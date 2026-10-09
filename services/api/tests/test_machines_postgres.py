"""Real PostgreSQL machine ownership, idempotency and performed-set context."""

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
    MachineConfiguration,
    MachineMutationReceipt,
    MachineProfile,
    WorkoutOccurrence,
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


def _profile(nickname: str, unit: str) -> dict[str, object]:
    return {
        "protocol_version": 1,
        "kind": "CREATE_MACHINE_PROFILE",
        "mutation_id": str(uuid4()),
        "profile_id": str(uuid4()),
        "nickname": nickname,
        "catalog_equipment_id": None,
        "manufacturer": None,
        "model_name": None,
        "native_load_unit": unit,
        "load_entry_semantics": "machine_display",
        "technical_metadata": {"observation": {"known_ratio": False}},
        "metadata_source": "user_entered",
    }


def _set(
    *,
    session_id: str,
    exercise_id: str,
    occurrence_id: str,
    profile: dict[str, object],
    configuration_id: str | None,
    first: bool,
    load: str,
    unit: str,
) -> dict[str, object]:
    return {
        "protocol_version": 1,
        "kind": (
            "CONFIRM_FIRST_SET_WITH_OCCURRENCE" if first else "CONFIRM_ADDITIONAL_SET"
        ),
        "session_id": session_id,
        "mutation_id": str(uuid4()),
        "set_id": str(uuid4()),
        "occurrence_id": occurrence_id,
        "canonical_exercise_id": exercise_id,
        "agenda_item_id": None,
        "actual_order": 0,
        "set_role": "WARMUP" if first else "WORKING",
        "measurement": {"measurementType": "reps", "reps": 12 if first else 8},
        "load": {
            "decimal": load,
            "unit": unit,
            "entrySemantics": "machine_display",
        },
        "machine": {
            "profileId": profile["profile_id"],
            "configurationId": configuration_id,
            "snapshot": {"label": profile["nickname"], "known_ratio": None},
        },
        "target_at_confirmation": None,
        "completed_at": "2026-10-09T07:15:00+00:00",
    }


def test_owned_profiles_and_configs_are_causal_set_dependencies() -> None:
    db_url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if db_url is None:
        pytest.skip("KEYLORFORGE_TEST_DATABASE_URL required for machine integration")
    engine = create_engine(db_url)
    subject_a, subject_b = uuid4(), uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(subject_a, subject_b)

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
        machine_a = _profile("Polea A", "kg")
        machine_b = _profile("Polea B", "lb")
        created_a = client.post("/machine-profiles", headers=a, json=machine_a)
        assert created_a.status_code == 201, created_a.text
        assert created_a.json()["native_load_unit"] == "kg"
        assert (
            client.get(
                f"/machine-profiles/{machine_a['profile_id']}", headers=b
            ).status_code
            == 404
        )
        assert (
            client.get(
                f"/machine-profiles/{machine_a['profile_id']}", headers=a
            ).status_code
            == 200
        )

        replay = deepcopy(machine_a)
        replay["technical_metadata"] = {"observation": {"known_ratio": False}}
        assert (
            client.post("/machine-profiles", headers=a, json=replay).json()
            == created_a.json()
        )
        changed = deepcopy(machine_a)
        changed["nickname"] = "Accidental rename on replay"
        assert (
            client.post("/machine-profiles", headers=a, json=changed).status_code == 409
        )
        assert (
            client.post("/machine-profiles", headers=b, json=machine_a).status_code
            == 409
        )
        assert (
            client.post("/machine-profiles", headers=a, json=machine_b).status_code
            == 201
        )

        config_a = {
            "protocol_version": 1,
            "kind": "CREATE_MACHINE_CONFIGURATION",
            "mutation_id": str(uuid4()),
            "configuration_id": str(uuid4()),
            "profile_id": machine_a["profile_id"],
            "label": "Cable output A",
            "material_setup": {"cable_output": "top", "handle": "single"},
            "metadata_source": "user_entered",
        }
        config_url = f"/machine-profiles/{machine_a['profile_id']}/configurations"
        assert client.post(config_url, headers=b, json=config_a).status_code == 404
        configured = client.post(config_url, headers=a, json=config_a)
        assert configured.status_code == 201, configured.text
        assert (
            client.post(config_url, headers=a, json=config_a).json()
            == configured.json()
        )
        assert (
            client.get(
                f"{config_url}/{config_a['configuration_id']}", headers=b
            ).status_code
            == 404
        )

        start = {
            "protocol_version": 1,
            "session_id": str(uuid4()),
            "mutation_id": str(uuid4()),
            "started_at": "2026-10-09T07:00:00+00:00",
            "time_zone": "Europe/Madrid",
        }
        assert (
            client.post("/workout-sessions/start", headers=a, json=start).status_code
            == 201
        )
        blocked_cross_family = deepcopy(machine_a)
        blocked_cross_family["profile_id"] = str(uuid4())
        blocked_cross_family["mutation_id"] = start["mutation_id"]
        assert (
            client.post(
                "/machine-profiles", headers=a, json=blocked_cross_family
            ).status_code
            == 409
        )

        session_id = start["session_id"]
        path = f"/workout-sessions/{session_id}/sets"
        occurrence_id = str(uuid4())
        first = _set(
            session_id=session_id,
            exercise_id=str(exercise_id),
            occurrence_id=occurrence_id,
            profile=machine_a,
            configuration_id=config_a["configuration_id"],
            first=True,
            load="20.5",
            unit="kg",
        )
        first_response = client.post(f"{path}/first", headers=a, json=first)
        assert first_response.status_code == 201, first_response.text
        assert first_response.json()["machine_profile_id"] == machine_a["profile_id"]
        assert (
            client.post(f"{path}/first", headers=a, json=first).json()
            == first_response.json()
        )

        next_set = _set(
            session_id=session_id,
            exercise_id=str(exercise_id),
            occurrence_id=occurrence_id,
            profile=machine_b,
            configuration_id=None,
            first=False,
            load="27.5",
            unit="lb",
        )
        second = client.post(f"{path}/additional", headers=a, json=next_set)
        assert second.status_code == 201, second.text
        assert second.json()["load_unit"] == "lb"

        bad_unit = deepcopy(next_set)
        bad_unit["mutation_id"] = str(uuid4())
        bad_unit["set_id"] = str(uuid4())
        bad_unit["load"]["unit"] = "kg"
        assert (
            client.post(f"{path}/additional", headers=a, json=bad_unit).status_code
            == 422
        )
        bad_config = deepcopy(next_set)
        bad_config["mutation_id"] = str(uuid4())
        bad_config["set_id"] = str(uuid4())
        bad_config["machine"]["configurationId"] = config_a["configuration_id"]
        assert (
            client.post(f"{path}/additional", headers=a, json=bad_config).status_code
            == 404
        )

        with Session(engine) as db:
            stored = db.scalars(select(WorkoutSet)).all()
            assert len(stored) == 2
            assert len(db.scalars(select(WorkoutOccurrence)).all()) == 1
            assert {row.load_unit for row in stored} == {"kg", "lb"}
            assert {row.machine_profile_id for row in stored} == {
                UUID(machine_a["profile_id"]),
                UUID(machine_b["profile_id"]),
            }
            assert {row.machine_snapshot["label"] for row in stored} == {
                "Polea A",
                "Polea B",
            }
            assert len(db.scalars(select(MachineProfile)).all()) == 2
            assert len(db.scalars(select(MachineConfiguration)).all()) == 1
            assert len(db.scalars(select(MachineMutationReceipt)).all()) == 3

            owner = ApplicationUserRepository(db).get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE,
                external_subject=subject_a,
            )
            purge_account_workout_data(db, owner.id)
            db.commit()
            assert db.scalars(select(WorkoutSet)).all() == []
            assert db.scalars(select(MachineConfiguration)).all() == []
            assert db.scalars(select(MachineProfile)).all() == []
            assert db.scalars(select(MachineMutationReceipt)).all() == []
    finally:
        engine.dispose()
