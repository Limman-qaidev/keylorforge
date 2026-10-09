"""Atomic, owner-authorized first and additional performed-set mutations."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC
from decimal import Decimal

from fastapi import HTTPException
from keylorforge_database.models import (
    CatalogExercise,
    MachineConfiguration,
    MachineMutationReceipt,
    MachineProfile,
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
    if session.get(MachineMutationReceipt, (request.mutation_id, owner.id)) is not None:
        raise HTTPException(409, detail="mutation ID already used for machine")
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

    # Applied agenda revisions are not yet synchronized. Do not fabricate
    # authoritative target snapshots from unacknowledged client draft state.
    if request.agenda_item_id is not None:
        raise HTTPException(409, detail="agenda item dependency not yet synchronized")
    if request.target_at_confirmation is not None:
        # Unverified targets cannot be authoritative performed-history
        # provenance until an applied agenda revision has been acknowledged.
        raise HTTPException(409, detail="target dependency not yet synchronized")
    profile_id = None
    configuration_id = None
    machine_snapshot = None
    if request.machine is not None:
        # A machine created offline must be acknowledged separately first.
        # Never accept references to another owner's equipment.
        profile = session.get(MachineProfile, request.machine.profileId)
        if profile is None or profile.owner_user_id != owner.id:
            raise HTTPException(404, detail="machine profile not found")
        if request.machine.configurationId is not None:
            configuration = session.get(
                MachineConfiguration, request.machine.configurationId
            )
            if (
                configuration is None
                or configuration.owner_user_id != owner.id
                or configuration.machine_profile_id != profile.id
            ):
                raise HTTPException(404, detail="machine configuration not found")
            configuration_id = configuration.id

        if request.load is not None:
            if (
                profile.native_load_unit is not None
                and request.load.unit != profile.native_load_unit
            ):
                raise HTTPException(422, detail="load unit differs from machine native unit")
            if (
                profile.load_entry_semantics is not None
                and request.load.entrySemantics != profile.load_entry_semantics
            ):
                raise HTTPException(422, detail="machine load entry semantics mismatch")
        profile_id = profile.id
        # This is an immutable user-reported set-context snapshot, not an
        # inferred effective load nor manufacturer-verified resistance.
        machine_snapshot = request.machine.snapshot

    exercise = session.get(CatalogExercise, request.canonical_exercise_id)
    if (
        exercise is None
        or not exercise.is_active
        or exercise.canonical_exercise_id is not None
    ):
        raise HTTPException(422, detail="canonical exercise not available")

    if exercise.measurement_type.value != request.measurement.measurementType:
        raise HTTPException(422, detail="measurement incompatible with exercise")

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
        machine_profile_id=profile_id,
        machine_configuration_id=configuration_id,
        machine_snapshot=machine_snapshot,
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
