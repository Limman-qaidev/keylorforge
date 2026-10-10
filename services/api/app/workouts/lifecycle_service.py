"""Read-only owner-fenced authoritative workout lifecycle.

Absence (404) is ambiguous: unknown, foreign and deleted sessions are not
distinguishable. Only a positive response proves an existing lifecycle state.
Never infer ACKs or amend the device's SQLite cache here.
"""

from __future__ import annotations

from datetime import UTC
from typing import Literal, cast
from uuid import UUID

from fastapi import HTTPException
from keylorforge_database.models import WorkoutCompletionSnapshot, WorkoutSession
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.finish_schemas import FreeWorkoutCompletionSnapshot
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
    if snapshot is not None:
        # A row existing is not proof of a valid completion. Reject any
        # damaged or mismatched immutable provenance before returning "completed".
        try:
            final = FreeWorkoutCompletionSnapshot.model_validate(snapshot.final_agenda)
        except ValidationError as exc:
            raise HTTPException(
                409, detail="inconsistent authoritative lifecycle"
            ) from exc
        if (
            final.session_id != workout.id
            or final.completion_snapshot_id != snapshot.id
            or final.finished_at_utc.astimezone(UTC)
            != snapshot.finished_at.astimezone(UTC)
            or final.time_zone != workout.time_zone
            or final.local_date != workout.local_date
            or final.final_agenda_revision != workout.agenda_revision
            or final.original_agenda.model_dump(mode="json")
            != workout.start_prescription
        ):
            raise HTTPException(409, detail="inconsistent authoritative lifecycle")

    return WorkoutLifecycleStateResponse(
        session_id=workout.id,
        lifecycle_state=cast(Literal["active", "completed", "cancelled"], lifecycle),
        completion_snapshot_id=snapshot.id if snapshot is not None else None,
    )
