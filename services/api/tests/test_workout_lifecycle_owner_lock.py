"""Security regression for M3 authoritative lifecycle owner fencing."""

from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts import lifecycle_service


def test_lifecycle_read_locks_owner_before_probing_workout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    caller = AuthenticatedPrincipal(external_subject=uuid4())
    owner = SimpleNamespace(id=uuid4())
    db = Mock(spec=Session)
    db.get.return_value = None
    locks: list[bool] = []

    def active_owner(
        session: Session, principal: AuthenticatedPrincipal, *, lock: bool
    ) -> SimpleNamespace:
        assert session is db
        assert principal is caller
        locks.append(lock)
        return owner

    monkeypatch.setattr(lifecycle_service, "_active_owner", active_owner)
    with pytest.raises(HTTPException) as failure:
        lifecycle_service.get_authoritative_workout_lifecycle(
            session=db, principal=caller, session_id=uuid4()
        )
    assert failure.value.status_code == 404
    assert locks == [True]
    db.get.assert_called_once()
