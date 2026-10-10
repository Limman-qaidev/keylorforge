"""Read-only owner-fenced authoritative workout lifecycle.

Absence (404) is ambiguous: unknown, foreign and deleted sessions are not
distinguishable. Only a positive response proves an existing lifecycle state.
Never infer ACKs or amend the device's SQLite cache here.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from keylorforge_database.models import WorkoutCompletionSnapshot, WorkoutSession
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.service import _active_owner


class WorkoutLifecycleStateResponse(BaseModel):
    session_id: UUID
    lifecycle_state: Literal["active", "completed", "cancelled"]
    completion_snapshot_id: UUID | None


def get_authoritative_workout_lifecycle(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    session_id: UUID,
) -> WorkoutLifecycleStateResponse:
    """Return only a session owned by the authenticated active application user."""
    owner = _active_owner(session, principal, lock=False)
    workout = session.get(WorkoutSession, session_id)
    if workout is None or workout.owner_user_id != owner.id:
        raise HTTPException(404, detail="workout session not found")

    snapshot = session.scalar(
        select(WorkoutCompletionSnapshot).where(
            WorkoutCompletionSnapshot.session_id == session_id,
            WorkoutCompletionSnapshot.owner_user_id == owner.id,
        )
    )
    lifecycle = workout.lifecycle_state
    if lifecycle not in {"active", "completed", "cancelled"}:
        raise HTTPException(409, detail="inconsistent authoritative lifecycle")
    if (lifecycle == "completed") != (snapshot is not None):
        raise HTTPException(409, detail="inconsistent authoritative lifecycle")

    return WorkoutLifecycleStateResponse(
        session_id=workout.id,
        lifecycle_state=lifecycle,
        completion_snapshot_id=snapshot.id if snapshot is not None else None,
    )
