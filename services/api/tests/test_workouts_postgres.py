"""Real PostgreSQL caller isolation, idempotency, and account purge for M3 start."""

from __future__ import annotations

import os
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from keylorforge_database.identity import ApplicationUserRepository
from keylorforge_database.models import (
    ApplicationUser,
    ApplicationUserLifecycle,
    AuthProvider,
    Base,
    WorkoutMutationReceipt,
    WorkoutSession,
)
from keylorforge_database.workouts import purge_account_workout_data
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


def _payload(
    *, session_id: UUID | None = None, mutation_id: UUID | None = None
) -> dict[str, str]:
    return {
        "session_id": str(session_id or uuid4()),
        "mutation_id": str(mutation_id or uuid4()),
        "started_at": "2026-10-08T14:30:00+00:00",
        "time_zone": "Europe/Madrid",
    }


def test_free_session_start_resume_idempotency_isolation_and_purge() -> None:
    db_url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if db_url is None:
        pytest.skip("KEYLORFORGE_TEST_DATABASE_URL required for PostgreSQL integration")
    engine = create_engine(db_url)
    subject_a, subject_b = uuid4(), uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co"))
    app.state.jwt_verifier = _Verifier(subject_a, subject_b)

    def db_session():
        with Session(engine) as session:
            try:
                yield session
                session.commit()
            except BaseException:
                session.rollback()
                raise

    app.dependency_overrides[get_database_session] = db_session
    client = TestClient(app)
    a = {"Authorization": "Bearer owner-a"}
    b = {"Authorization": "Bearer owner-b"}

    try:
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        assert client.get("/workout-sessions/active", headers=a).json() is None
        assert client.get("/workout-sessions/active", headers=b).json() is None

        payload_a = _payload()
        first = client.post("/workout-sessions/start", headers=a, json=payload_a)
        assert first.status_code == 201, first.text
        assert first.json()["id"] == payload_a["session_id"]
        assert first.json()["lifecycle_state"] == "active"
        assert first.json()["origin"] == "free"
        assert first.json()["local_date"] == "2026-10-08"
        assert first.json()["utc_offset_minutes"] == 120
        assert first.json()["agenda_revision"] == 0

        # Lost HTTP acknowledgement: identical replay returns original answer.
        repeat = client.post("/workout-sessions/start", headers=a, json=payload_a)
        assert repeat.status_code == 201
        assert repeat.json() == first.json()

        tampered = {**payload_a, "time_zone": "UTC"}
        assert (
            client.post("/workout-sessions/start", headers=a, json=tampered).status_code
            == 409
        )
        # Different new start cannot silently create a second active session.
        assert (
            client.post(
                "/workout-sessions/start", headers=a, json=_payload()
            ).status_code
            == 409
        )
        # UUID collision against another owner must not disclose their session.
        assert (
            client.post(
                "/workout-sessions/start",
                headers=b,
                json=_payload(session_id=UUID(payload_a["session_id"])),
            ).status_code
            == 409
        )
        assert client.get("/workout-sessions/active", headers=b).json() is None

        other = client.post("/workout-sessions/start", headers=b, json=_payload())
        assert other.status_code == 201
        assert client.get("/workout-sessions/active", headers=a).json() == first.json()
        assert client.get("/workout-sessions/active", headers=b).json() == other.json()

        with Session(engine) as session:
            owner_a = ApplicationUserRepository(session).get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject_a
            )
            owner_a_id = owner_a.id
            session.commit()
        with Session(engine) as session:
            rows = session.scalars(
                select(WorkoutSession).where(WorkoutSession.owner_user_id == owner_a_id)
            ).all()
            assert len(rows) == 1
            assert rows[0].start_prescription == {
                "schema_version": 1,
                "origin": "free",
                "items": [],
            }
            assert len(session.scalars(select(WorkoutMutationReceipt)).all()) == 2
            # Mirrors owner terminalization + purge before provider deletion.
            owner = session.get(ApplicationUser, owner_a_id)
            assert owner is not None
            owner.lifecycle_state = ApplicationUserLifecycle.DELETION_IN_PROGRESS
            session.commit()
            purge_account_workout_data(session, owner_a_id)
            session.commit()

        assert client.get("/workout-sessions/active", headers=a).status_code == 403
        assert client.get("/workout-sessions/active", headers=b).json() == other.json()
        with Session(engine) as session:
            assert (
                session.scalars(
                    select(WorkoutSession).where(
                        WorkoutSession.owner_user_id == owner_a_id
                    )
                ).all()
                == []
            )
            assert (
                session.scalars(
                    select(WorkoutMutationReceipt).where(
                        WorkoutMutationReceipt.owner_user_id == owner_a_id
                    )
                ).all()
                == []
            )
            assert len(session.scalars(select(WorkoutSession)).all()) == 1
    finally:
        engine.dispose()
