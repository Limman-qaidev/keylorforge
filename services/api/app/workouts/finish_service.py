"""Authoritative, owner-locked and failure-atomic Free Workout FINISH."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC

from fastapi import HTTPException
from keylorforge_database.models import (
    MachineMutationReceipt,
    WorkoutCompletionSnapshot,
    WorkoutMutationReceipt,
    WorkoutOccurrence,
    WorkoutSession,
    WorkoutSet,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.finish_schemas import (
    FinishFreeWorkoutRequest,
    FinishFreeWorkoutResponse,
)
from app.workouts.service import _active_owner


def _hash_finish(request: FinishFreeWorkoutRequest) -> str:
    body = request.model_dump(mode="json")
    body["completion_snapshot"]["finished_at_utc"] = (
        request.completion_snapshot.finished_at_utc.astimezone(UTC).isoformat()
    )
    serialized = json.dumps(
        body, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def finish_free_workout(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    request: FinishFreeWorkoutRequest,
) -> FinishFreeWorkoutResponse:
    """One owner lock and one SQL transaction; caller commits after response."""
    owner = _active_owner(session, principal, lock=True)
    digest = _hash_finish(request)
    if session.get(MachineMutationReceipt, (request.mutation_id, owner.id)) is not None:
        raise HTTPException(409, detail="mutation ID already used for machine")
    receipt = session.get(WorkoutMutationReceipt, (request.mutation_id, owner.id))
    if receipt is not None:
        if receipt.session_id != request.session_id or receipt.intent_hash != digest:
            raise HTTPException(409, detail="mutation ID reused for different intent")
        return FinishFreeWorkoutResponse.model_validate(receipt.response_payload)

    workout = session.get(WorkoutSession, request.session_id)
    if workout is None or workout.owner_user_id != owner.id:
        raise HTTPException(404, detail="workout session not found")
    if workout.lifecycle_state != "active":
        raise HTTPException(409, detail="workout session is not active")
    snapshot = request.completion_snapshot
    finished_at = snapshot.finished_at_utc.astimezone(UTC)
    if finished_at < workout.started_at.astimezone(UTC):
        raise HTTPException(422, detail="finish before session start")
    if (
        workout.origin != "free"
        or workout.agenda_revision != 0
        or workout.start_prescription != {
            "schema_version": 1, "origin": "free", "items": []
        }
        or snapshot.time_zone != workout.time_zone
        or snapshot.local_date != workout.local_date
    ):
        raise HTTPException(409, detail="unsupported or stale agenda revision")
    if session.get(WorkoutCompletionSnapshot, snapshot.completion_snapshot_id):
        raise HTTPException(409, detail="completion snapshot ID already in use")

    occurrences = session.scalars(
        select(WorkoutOccurrence)
        .where(
            WorkoutOccurrence.owner_user_id == owner.id,
            WorkoutOccurrence.session_id == workout.id,
        )
        .order_by(WorkoutOccurrence.actual_order, WorkoutOccurrence.id)
    ).all()
    confirmed = session.scalars(
        select(WorkoutSet)
        .where(
            WorkoutSet.owner_user_id == owner.id,
            WorkoutSet.session_id == workout.id,
        )
        .order_by(WorkoutSet.completed_at, WorkoutSet.id)
    ).all()

    if not any(row.set_role == "WORKING" for row in confirmed):
        raise HTTPException(422, detail="qualifying WORKING set required")
    if max(row.completed_at.astimezone(UTC) for row in confirmed) > finished_at:
        raise HTTPException(422, detail="finish precedes performed set")

    # Full equality with persisted authoritative history: never accept a
    # client claim about a set/occurrence that is absent, omitted or unowned.
    expected: list[dict[str, object]] = []
    linked = set()
    for occurrence in occurrences:
        relevant = [
            row for row in confirmed if row.occurrence_id == occurrence.id
        ]
        if not relevant or occurrence.agenda_item_id is not None:
            raise HTTPException(409, detail="unsupported or corrupt occurrence history")
        linked.update(row.id for row in relevant)
        expected.append(
            {
                "occurrence_id": str(occurrence.id),
                "canonical_exercise_id": str(occurrence.canonical_exercise_id),
                "actual_order": occurrence.actual_order,
                "agenda_item_id": None,
                "set_ids": [str(row.id) for row in relevant],
            }
        )
    if len(linked) != len(confirmed):
        raise HTTPException(409, detail="incomplete performed history")
    actual = [
        row.model_dump(mode="json")
        for row in snapshot.unplanned_performed_occurrences
    ]
    if actual != expected:
        raise HTTPException(409, detail="stale or unacknowledged performed history")

    # The session transition, immutable snapshot and same-owner mutation
    # receipt are committed (or rolled back) by one SQLAlchemy transaction.
    workout.lifecycle_state = "completed"
    session.add(
        WorkoutCompletionSnapshot(
            id=snapshot.completion_snapshot_id,
            session_id=workout.id,
            owner_user_id=owner.id,
            finish_mutation_id=request.mutation_id,
            finished_at=finished_at,
            final_agenda=snapshot.model_dump(mode="json"),
        )
    )
    response = FinishFreeWorkoutResponse(
        session_id=workout.id,
        mutation_id=request.mutation_id,
        completion_snapshot_id=snapshot.completion_snapshot_id,
        lifecycle_state="completed",
        completed_at=finished_at,
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
