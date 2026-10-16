"""Security regression: workout details hold the owner deletion fence."""

from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts import history_detail_service


def test_completed_detail_locks_owner_before_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even a missing workout must lock the owner's row before probing data."""
    principal = AuthenticatedPrincipal(external_subject=uuid4())
    owner = SimpleNamespace(id=uuid4())
    db = Mock(spec=Session)
    db.get.return_value = None
    seen: list[bool] = []

    def active_owner(
        session: Session, caller: AuthenticatedPrincipal, *, lock: bool
    ) -> SimpleNamespace:
        assert session is db
        assert caller is principal
        seen.append(lock)
        return owner

    monkeypatch.setattr(history_detail_service, "_active_owner", active_owner)
    with pytest.raises(HTTPException) as failure:
        history_detail_service.get_completed_workout_detail(
            session=db, principal=principal, session_id=uuid4()
        )
    assert failure.value.status_code == 404
    assert seen == [True]
    db.get.assert_called_once()
