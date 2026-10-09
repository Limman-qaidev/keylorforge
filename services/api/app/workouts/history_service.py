"""Read-only, owner-fenced and cursor-paginated authoritative workout history.

This endpoint exposes immutable confirmed FINISH snapshots for reconciliation.
It never imports remote rows into a device, replaces pending local actions, or
silently resolves conflicts. Callers must compare identities before any merge.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import HTTPException
from keylorforge_database.models import (
    WorkoutCompletionSnapshot,
    WorkoutSession,
    WorkoutSet,
)
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.finish_schemas import FreeWorkoutCompletionSnapshot
from app.workouts.service import _active_owner


class CompletedWorkoutHistoryEntry(BaseModel):
    session_id: UUID
    completion_snapshot_id: UUID
    finish_mutation_id: UUID
    started_at: AwareDatetime
    finished_at: AwareDatetime
    local_date: date
    total_sets: int = Field(ge=1)
    working_sets: int = Field(ge=1)
    completion_snapshot: FreeWorkoutCompletionSnapshot


class CompletedWorkoutHistoryPage(BaseModel):
    entries: list[CompletedWorkoutHistoryEntry]
    next_before_finished_at: AwareDatetime | None = None
    next_before_session_id: UUID | None = None


def list_authoritative_completed_workouts(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    limit: int = 20,
    before_finished_at: datetime | None = None,
    before_session_id: UUID | None = None,
) -> CompletedWorkoutHistoryPage:
    """Stable keyset pagination ordered by (finished_at, session_id) DESC.

    A complete page's cursor refers to the LAST returned item. Requests with
    only half the cursor are rejected; a page never skips rows when a new
    workout completes between reads. No non-owner session can be enumerated.
    """
    if not 1 <= limit <= 50:
        raise HTTPException(422, detail="history limit must be 1..50")
    if (before_finished_at is None) != (before_session_id is None):
        raise HTTPException(422, detail="incomplete history cursor")
    if before_finished_at is not None and before_finished_at.utcoffset() is None:
        raise HTTPException(422, detail="history cursor must include timezone")

    owner = _active_owner(session, principal, lock=True)
    query = (
        select(WorkoutCompletionSnapshot, WorkoutSession)
        .join(
            WorkoutSession,
            and_(
                WorkoutCompletionSnapshot.session_id == WorkoutSession.id,
                WorkoutCompletionSnapshot.owner_user_id
                == WorkoutSession.owner_user_id,
            ),
        )
        .where(
            WorkoutCompletionSnapshot.owner_user_id == owner.id,
            WorkoutSession.owner_user_id == owner.id,
            WorkoutSession.lifecycle_state == "completed",
        )
    )
    if before_finished_at is not None and before_session_id is not None:
        utc_cursor = before_finished_at.astimezone(UTC)
        query = query.where(
            or_(
                WorkoutCompletionSnapshot.finished_at < utc_cursor,
                and_(
                    WorkoutCompletionSnapshot.finished_at == utc_cursor,
                    WorkoutCompletionSnapshot.session_id < before_session_id,
                ),
            )
        )

    records = session.execute(
        query.order_by(
            WorkoutCompletionSnapshot.finished_at.desc(),
            WorkoutCompletionSnapshot.session_id.desc(),
        ).limit(limit + 1)
    ).all()
    has_more = len(records) > limit
    records = records[:limit]
    if not records:
        return CompletedWorkoutHistoryPage(entries=[])

    session_ids = [snapshot.session_id for snapshot, _ in records]
    counts = session.execute(
        select(
            WorkoutSet.session_id,
            func.count(WorkoutSet.id),
            func.count(WorkoutSet.id).filter(WorkoutSet.set_role == "WORKING"),
        )
        .where(
            WorkoutSet.owner_user_id == owner.id,
            WorkoutSet.session_id.in_(session_ids),
        )
        .group_by(WorkoutSet.session_id)
    ).all()
    by_session = {sid: (total, working) for sid, total, working in counts}

    entries: list[CompletedWorkoutHistoryEntry] = []
    for snapshot, workout in records:
        final = FreeWorkoutCompletionSnapshot.model_validate(snapshot.final_agenda)
        same_finish_instant = (
            final.finished_at_utc.astimezone(UTC)
            == snapshot.finished_at.astimezone(UTC)
        )
        total, working = by_session.get(snapshot.session_id, (0, 0))
        linked_set_ids = [
            set_id
            for occurrence in final.unplanned_performed_occurrences
            for set_id in occurrence.set_ids
        ]
        if (
            final.session_id != workout.id
            or final.completion_snapshot_id != snapshot.id
            or not same_finish_instant
            or final.time_zone != workout.time_zone
            or final.local_date != workout.local_date
            or len(linked_set_ids) != total
            or working < 1
        ):
            raise HTTPException(409, detail="inconsistent authoritative history")
        entries.append(
            CompletedWorkoutHistoryEntry(
                session_id=workout.id,
                completion_snapshot_id=snapshot.id,
                finish_mutation_id=snapshot.finish_mutation_id,
                started_at=workout.started_at,
                finished_at=snapshot.finished_at,
                local_date=workout.local_date,
                total_sets=total,
                working_sets=working,
                completion_snapshot=final,
            )
        )

    last = records[-1][0]
    return CompletedWorkoutHistoryPage(
        entries=entries,
        next_before_finished_at=last.finished_at if has_more else None,
        next_before_session_id=last.session_id if has_more else None,
    )
