"""Owner-scoped, read-only finished workout detail for later safe device recovery.

The paginated history endpoint exposes immutable completion metadata only.
Full native performed-set fields must be fetched before any device can even
consider rebuilding its read model. This endpoint NEVER mutates or imports.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from keylorforge_database.models import (
    WorkoutCompletionSnapshot,
    WorkoutOccurrence,
    WorkoutSession,
    WorkoutSet,
)
from pydantic import AwareDatetime, BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.finish_schemas import FreeWorkoutCompletionSnapshot
from app.workouts.service import _active_owner


class PerformedSetDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    set_id: UUID
    mutation_id: UUID
    occurrence_id: UUID
    set_role: str
    measurement_type: str
    reps: int | None
    duration_seconds: int | None
    distance_decimal: str | None
    distance_unit: str | None
    load_decimal: str | None
    load_unit: str | None
    load_entry_semantics: str | None
    machine_profile_id: UUID | None
    machine_configuration_id: UUID | None
    machine_snapshot: dict[str, object] | None
    target_at_confirmation: dict[str, object] | None
    completed_at: AwareDatetime


class PerformedOccurrenceDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurrence_id: UUID
    canonical_exercise_id: UUID
    agenda_item_id: UUID | None
    actual_order: int
    first_set_id: UUID
    sets: list[PerformedSetDetail]


class CompletedWorkoutDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: UUID
    lifecycle_state: str
    started_at: AwareDatetime
    finished_at: AwareDatetime
    time_zone: str
    utc_offset_minutes: int
    local_date: str
    agenda_revision: int
    completion_snapshot_id: UUID
    finish_mutation_id: UUID
    completion_snapshot: FreeWorkoutCompletionSnapshot
    occurrences: list[PerformedOccurrenceDetail]


def _decimal(value: Decimal | None) -> str | None:
    return format(value, "f") if value is not None else None


def get_completed_workout_detail(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    session_id: UUID,
) -> CompletedWorkoutDetail:
    owner = _active_owner(session, principal, lock=False)
    workout = session.get(WorkoutSession, session_id)
    if (
        workout is None
        or workout.owner_user_id != owner.id
        or workout.lifecycle_state != "completed"
    ):
        raise HTTPException(404, detail="completed workout not found")

    snapshot = session.scalar(
        select(WorkoutCompletionSnapshot).where(
            WorkoutCompletionSnapshot.session_id == session_id,
            WorkoutCompletionSnapshot.owner_user_id == owner.id,
        )
    )
    if snapshot is None:
        raise HTTPException(409, detail="inconsistent authoritative history")

    final = FreeWorkoutCompletionSnapshot.model_validate(snapshot.final_agenda)
    if (
        final.session_id != session_id
        or final.completion_snapshot_id != snapshot.id
        or final.finished_at_utc != snapshot.finished_at
        or final.time_zone != workout.time_zone
        or final.local_date != workout.local_date
    ):
        raise HTTPException(409, detail="inconsistent authoritative history")

    occurrences = session.scalars(
        select(WorkoutOccurrence)
        .where(
            WorkoutOccurrence.owner_user_id == owner.id,
            WorkoutOccurrence.session_id == session_id,
        )
        .order_by(WorkoutOccurrence.actual_order, WorkoutOccurrence.id)
    ).all()
    rows = session.scalars(
        select(WorkoutSet)
        .where(
            WorkoutSet.owner_user_id == owner.id,
            WorkoutSet.session_id == session_id,
        )
        .order_by(WorkoutSet.completed_at, WorkoutSet.id)
    ).all()

    sets_by_occurrence: dict[UUID, list[WorkoutSet]] = {}
    for row in rows:
        sets_by_occurrence.setdefault(row.occurrence_id, []).append(row)

    snapshot_items = {
        item.occurrence_id: item
        for item in final.unplanned_performed_occurrences
    }
    details: list[PerformedOccurrenceDetail] = []
    all_set_ids: set[UUID] = set()
    working_sets = 0
    for occurrence in occurrences:
        declared = snapshot_items.pop(occurrence.id, None)
        if (
            declared is None
            or declared.canonical_exercise_id != occurrence.canonical_exercise_id
            or declared.actual_order != occurrence.actual_order
            or declared.agenda_item_id is not None
        ):
            raise HTTPException(409, detail="inconsistent authoritative history")
        own_sets = sets_by_occurrence.pop(occurrence.id, [])
        if not own_sets or not any(row.id == occurrence.first_set_id for row in own_sets):
            raise HTTPException(409, detail="inconsistent authoritative history")
        if set(declared.set_ids) != {row.id for row in own_sets}:
            raise HTTPException(409, detail="inconsistent authoritative history")
        payload_sets: list[PerformedSetDetail] = []
        for row in own_sets:
            if row.id in all_set_ids:
                raise HTTPException(409, detail="inconsistent authoritative history")
            all_set_ids.add(row.id)
            working_sets += row.set_role == "WORKING"
            payload_sets.append(
                PerformedSetDetail(
                    set_id=row.id,
                    mutation_id=row.mutation_id,
                    occurrence_id=row.occurrence_id,
                    set_role=row.set_role,
                    measurement_type=row.measurement_type,
                    reps=row.reps,
                    duration_seconds=row.duration_seconds,
                    distance_decimal=_decimal(row.distance_value),
                    distance_unit=row.distance_unit,
                    load_decimal=_decimal(row.load_value),
                    load_unit=row.load_unit,
                    load_entry_semantics=row.load_entry_semantics,
                    machine_profile_id=row.machine_profile_id,
                    machine_configuration_id=row.machine_configuration_id,
                    machine_snapshot=row.machine_snapshot,
                    target_at_confirmation=row.target_at_confirmation,
                    completed_at=row.completed_at,
                )
            )
        details.append(
            PerformedOccurrenceDetail(
                occurrence_id=occurrence.id,
                canonical_exercise_id=occurrence.canonical_exercise_id,
                agenda_item_id=occurrence.agenda_item_id,
                actual_order=occurrence.actual_order,
                first_set_id=occurrence.first_set_id,
                sets=payload_sets,
            )
        )

    expected = {
        UUID(str(set_id))
        for item in final.unplanned_performed_occurrences
        for set_id in item.set_ids
    }
    if (
        sets_by_occurrence
        or snapshot_items
        or not rows
        or working_sets < 1
        or expected != all_set_ids
        or sum(len(item.set_ids) for item in final.unplanned_performed_occurrences)
        != len(rows)
        or len(occurrences) != len(final.unplanned_performed_occurrences)
    ):
        raise HTTPException(409, detail="inconsistent authoritative history")

    return CompletedWorkoutDetail(
        session_id=session_id,
        lifecycle_state="completed",
        started_at=workout.started_at,
        finished_at=snapshot.finished_at,
        time_zone=workout.time_zone,
        utc_offset_minutes=workout.utc_offset_minutes,
        local_date=str(workout.local_date),
        agenda_revision=workout.agenda_revision,
        completion_snapshot_id=snapshot.id,
        finish_mutation_id=snapshot.finish_mutation_id,
        completion_snapshot=final,
        occurrences=details,
    )
