"""Owner-locked, idempotent and rollback-atomic CANCEL_SESSION lifecycle."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC

from fastapi import HTTPException
from keylorforge_database.models import (
    MachineMutationReceipt,
    WorkoutMutationReceipt,
    WorkoutSession,
    WorkoutSet,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.cancel_schemas import (
    CancelFreeWorkoutRequest,
    CancelFreeWorkoutResponse,
)
from app.workouts.service import _active_owner


def _cancel_digest(request: CancelFreeWorkoutRequest) -> str:
    payload = request.model_dump(mode="json")
    payload["cancelled_at_utc"] = request.cancelled_at_utc.astimezone(UTC).isoformat()
    stable = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()


def cancel_free_workout(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    request: CancelFreeWorkoutRequest,
) -> CancelFreeWorkoutResponse:
    """A cancelled workout is auditable and retains its performed set rows."""
    owner = _active_owner(session, principal, lock=True)
    digest = _cancel_digest(request)
    if session.get(MachineMutationReceipt, (request.mutation_id, owner.id)) is not None:
        raise HTTPException(409, detail="mutation ID already used for machine")
    receipt = session.get(WorkoutMutationReceipt, (request.mutation_id, owner.id))
    if receipt is not None:
        if receipt.session_id != request.session_id or receipt.intent_hash != digest:
            raise HTTPException(409, detail="mutation ID reused for different intent")
        # Do not silently interpret a different mutation's cached receipt as
        # a cancellation, even with an unexpected digest collision.
        if receipt.response_payload.get("lifecycle_state") != "cancelled":
            raise HTTPException(409, detail="mutation ID already used")
        return CancelFreeWorkoutResponse.model_validate(receipt.response_payload)

    workout = session.get(WorkoutSession, request.session_id)
    if workout is None or workout.owner_user_id != owner.id:
        raise HTTPException(404, detail="workout session not found")
    if workout.lifecycle_state != "active":
        raise HTTPException(409, detail="workout session is not active")
    if (
        workout.origin != "free"
        or workout.agenda_revision != 0
        or workout.start_prescription
        != {"schema_version": 1, "origin": "free", "items": []}
    ):
        raise HTTPException(409, detail="unsupported or stale agenda revision")

    cancelled_at = request.cancelled_at_utc.astimezone(UTC)
    if cancelled_at < workout.started_at.astimezone(UTC):
        raise HTTPException(422, detail="cancellation before session start")

    actual_count, last_set_at = session.execute(
        select(func.count(WorkoutSet.id), func.max(WorkoutSet.completed_at)).where(
            WorkoutSet.owner_user_id == owner.id,
            WorkoutSet.session_id == workout.id,
        )
    ).one()
    if request.confirmed_set_count != actual_count:
        raise HTTPException(409, detail="stale or unacknowledged set count")
    if actual_count and not request.discard_performed_sets_confirmed:
        raise HTTPException(422, detail="explicit discard confirmation required")
    if last_set_at is not None and cancelled_at < last_set_at.astimezone(UTC):
        raise HTTPException(422, detail="cancellation before last performed set")

    workout.lifecycle_state = "cancelled"
    response = CancelFreeWorkoutResponse(
        session_id=workout.id,
        mutation_id=request.mutation_id,
        lifecycle_state="cancelled",
        cancelled_at=cancelled_at,
        confirmed_set_count=actual_count,
    )
    session.add(
        WorkoutMutationReceipt(
            mutation_id=request.mutation_id,
            owner_user_id=owner.id,
            session_id=workout.id,
            intent_hash=digest,
            response_payload=response.model_dump(mode="json"),
        )
    )
    session.flush()
    return response
