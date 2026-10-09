"""Atomic, owner-authorized first and additional performed-set mutations."""
from __future__ import annotations

import hashlib
import json
from datetime import UTC
from decimal import Decimal

from fastapi import HTTPException
from keylorforge_database.models import (
    CatalogExercise,
    WorkoutMutationReceipt,
    WorkoutOccurrence,
    WorkoutSession,
    WorkoutSet,
)
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.service import _active_owner
from app.workouts.set_schemas import (
    ConfirmAdditionalSetRequest,
    ConfirmedSetResponse,
    ConfirmFirstSetRequest,
    DistanceMeasurement,
    RepsMeasurement,
    TimeMeasurement,
)

SetCommand = ConfirmFirstSetRequest | ConfirmAdditionalSetRequest


def _hash_command(request: SetCommand) -> str:
    body = request.model_dump(mode="json")
    body["completed_at"] = request.completed_at.astimezone(UTC).isoformat()
    stable = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()


def _acknowledgement(row: WorkoutSet) -> ConfirmedSetResponse:
    return ConfirmedSetResponse(
        session_id=row.session_id,
        occurrence_id=row.occurrence_id,
        set_id=row.id,
        mutation_id=row.mutation_id,
        set_role=row.set_role,
        measurement_type=row.measurement_type,
        completed_at=row.completed_at,
        load_decimal=str(row.load_value) if row.load_value is not None else None,
        load_unit=row.load_unit,
        machine_profile_id=row.machine_profile_id,
    )


def confirm_performed_set(
    *, session: Session, principal: AuthenticatedPrincipal, request: SetCommand
) -> ConfirmedSetResponse:
    """Prepare one authoritative transaction; request session owns the commit."""
    owner = _active_owner(session, principal, lock=True)
    digest = _hash_command(request)
    receipt = session.get(WorkoutMutationReceipt, (request.mutation_id, owner.id))
    if receipt is not None:
        if receipt.session_id != request.session_id or receipt.intent_hash != digest:
            raise HTTPException(409, detail="mutation ID reused for different intent")
        return ConfirmedSetResponse.model_validate(receipt.response_payload)

    parent = session.get(WorkoutSession, request.session_id)
    if parent is None or parent.owner_user_id != owner.id:
        raise HTTPException(404, detail="workout session not found")
    if parent.lifecycle_state != "active":
        raise HTTPException(409, detail="workout session is not active")
    if request.completed_at.astimezone(UTC) < parent.started_at.astimezone(UTC):
        raise HTTPException(422, detail="set completed before session start")

    # An applied agenda change and a created Machine Profile each require
    # their own authenticated server-side causal mutation. They are not yet
    # implemented: reject references instead of inventing an authoritative
    # agenda/profile or falsely acknowledging a dependent offline mutation.
    if request.agenda_item_id is not None:
        raise HTTPException(409, detail="agenda item dependency not yet synchronized")
    if request.machine is not None:
        raise HTTPException(409, detail="machine profile dependency not yet synchronized")

    exercise = session.get(CatalogExercise, request.canonical_exercise_id)
    if exercise is None or not exercise.is_active or exercise.canonical_exercise_id is not None:
        raise HTTPException(422, detail="canonical exercise not available")

    if session.get(WorkoutSet, request.set_id) is not None:
        raise HTTPException(409, detail="set ID already in use")

    existing = session.get(WorkoutOccurrence, request.occurrence_id)
    first = isinstance(request, ConfirmFirstSetRequest)
    if first:
        if existing is not None:
            raise HTTPException(409, detail="occurrence ID already in use")
        occurrence = WorkoutOccurrence(
            id=request.occurrence_id,
            owner_user_id=owner.id,
            session_id=parent.id,
            canonical_exercise_id=request.canonical_exercise_id,
            agenda_item_id=None,
            actual_order=request.actual_order,
            first_set_id=request.set_id,
        )
        # The first-set FK is deferred by Alembic. A failed set/receipt insert
        # rolls back this occurrence, and commit cannot leave it without a set.
        session.add(occurrence)
        session.flush()
    else:
        if (
            existing is None
            or existing.owner_user_id != owner.id
            or existing.session_id != parent.id
        ):
            raise HTTPException(404, detail="performed occurrence not found")
        if (
            existing.canonical_exercise_id != request.canonical_exercise_id
            or existing.actual_order != request.actual_order
            or existing.agenda_item_id != request.agenda_item_id
        ):
            raise HTTPException(409, detail="occurrence provenance mismatch")

    measurement = request.measurement
    performed = WorkoutSet(
        id=request.set_id,
        owner_user_id=owner.id,
        session_id=parent.id,
        occurrence_id=request.occurrence_id,
        mutation_id=request.mutation_id,
        set_role=request.set_role,
        measurement_type=measurement.measurementType,
        reps=measurement.reps if isinstance(measurement, RepsMeasurement) else None,
        duration_seconds=(
            measurement.durationSeconds
            if isinstance(measurement, TimeMeasurement)
            else None
        ),
        distance_value=(
            Decimal(measurement.distanceDecimal)
            if isinstance(measurement, DistanceMeasurement)
            else None
        ),
        distance_unit=(
            measurement.distanceUnit
            if isinstance(measurement, DistanceMeasurement)
            else None
        ),
        load_value=Decimal(request.load.decimal) if request.load else None,
        load_unit=request.load.unit if request.load else None,
        load_entry_semantics=request.load.entrySemantics if request.load else None,
        machine_profile_id=None,
        machine_configuration_id=None,
        machine_snapshot=None,
        target_at_confirmation=request.target_at_confirmation,
        completed_at=request.completed_at.astimezone(UTC),
    )
    session.add(performed)
    session.flush()
    response = _acknowledgement(performed)
    session.add(
        WorkoutMutationReceipt(
            mutation_id=request.mutation_id,
            owner_user_id=owner.id,
            session_id=parent.id,
            intent_hash=digest,
            response_payload=response.model_dump(mode="json"),
        )
    )
    session.flush()
    return response
