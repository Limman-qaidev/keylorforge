"""Owner-fenced, append-only exercise annotations and replay-safe reading."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from keylorforge_database.models import (
    WorkoutExerciseNoteEvent,
    WorkoutMutationReceipt,
    WorkoutOccurrence,
    WorkoutSession,
)
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.service import _active_owner


class ExerciseNoteCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocol_version: int = Field(ge=1, le=1)
    note_event_id: UUID
    session_id: UUID
    occurrence_id: UUID
    canonical_exercise_id: UUID
    body: str = Field(min_length=1, max_length=1000)
    created_at_utc: AwareDatetime

    @model_validator(mode="after")
    def validate_note(self) -> "ExerciseNoteCommand":
        if self.body != self.body.strip():
            raise ValueError("body must be trimmed")
        try:
            self.created_at_utc.astimezone(UTC)
        except (ValueError, OverflowError) as exc:
            raise ValueError("invalid note timestamp") from exc
        return self


class ExerciseNoteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note_event_id: UUID
    session_id: UUID
    occurrence_id: UUID
    canonical_exercise_id: UUID
    body: str
    created_at_utc: datetime


class ExerciseNotePage(BaseModel):
    items: list[ExerciseNoteResponse]


def _payload(note: WorkoutExerciseNoteEvent) -> ExerciseNoteResponse:
    return ExerciseNoteResponse(
        note_event_id=note.note_event_id,
        session_id=note.session_id,
        occurrence_id=note.occurrence_id,
        canonical_exercise_id=note.canonical_exercise_id,
        body=note.body,
        created_at_utc=note.created_at_utc,
    )


def append_exercise_note(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    command: ExerciseNoteCommand,
) -> ExerciseNoteResponse:
    """One owner lock serializes writes, deletes, and same-ID retries.

    Identical retries return the original row; conflicting UUID reuses reject.
    Existing performed sets and completion snapshots are never updated.
    """
    owner = _active_owner(session, principal, lock=True)
    existing = session.get(
        WorkoutExerciseNoteEvent, (command.note_event_id, owner.id)
    )
    if existing is not None:
        submitted = command.created_at_utc.astimezone(UTC)
        persisted = existing.created_at_utc.astimezone(UTC)
        if (
            existing.session_id != command.session_id
            or existing.occurrence_id != command.occurrence_id
            or existing.canonical_exercise_id != command.canonical_exercise_id
            or existing.body != command.body
            or submitted != persisted
        ):
            raise HTTPException(409, detail="note event ID reused")
        return _payload(existing)

    # Do not alias a legacy performed-set mutation UUID as a note event.
    if session.get(WorkoutMutationReceipt, (command.note_event_id, owner.id)):
        raise HTTPException(409, detail="note ID reused for performed mutation")

    workout = session.get(WorkoutSession, command.session_id)
    if (
        workout is None
        or workout.owner_user_id != owner.id
        or workout.lifecycle_state not in ("active", "completed")
    ):
        raise HTTPException(404, detail="workout not found")
    occurrence = session.get(WorkoutOccurrence, command.occurrence_id)
    if (
        occurrence is None
        or occurrence.owner_user_id != owner.id
        or occurrence.session_id != command.session_id
        or occurrence.canonical_exercise_id != command.canonical_exercise_id
    ):
        raise HTTPException(404, detail="exercise occurrence not found")

    note = WorkoutExerciseNoteEvent(
        note_event_id=command.note_event_id,
        owner_user_id=owner.id,
        session_id=command.session_id,
        occurrence_id=command.occurrence_id,
        canonical_exercise_id=command.canonical_exercise_id,
        body=command.body,
        created_at_utc=command.created_at_utc.astimezone(UTC),
    )
    session.add(note)
    session.flush()
    return _payload(note)


def list_exercise_notes(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    canonical_exercise_id: UUID,
    limit: int = 100,
) -> ExerciseNotePage:
    """Bounded cross-session notes for exactly one owner's canonical exercise."""
    if not 1 <= limit <= 100:
        raise HTTPException(422, detail="invalid limit")
    owner = _active_owner(session, principal, lock=True)
    notes = session.scalars(
        select(WorkoutExerciseNoteEvent)
        .where(
            WorkoutExerciseNoteEvent.owner_user_id == owner.id,
            WorkoutExerciseNoteEvent.canonical_exercise_id == canonical_exercise_id,
        )
        .order_by(
            WorkoutExerciseNoteEvent.created_at_utc.desc(),
            WorkoutExerciseNoteEvent.note_event_id.desc(),
        )
        .limit(limit)
    ).all()
    return ExerciseNotePage(items=[_payload(row) for row in notes])


def list_session_exercise_notes(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    session_id: UUID,
    limit: int = 100,
) -> ExerciseNotePage:
    if not 1 <= limit <= 100:
        raise HTTPException(422, detail="invalid limit")
    owner = _active_owner(session, principal, lock=True)
    workout = session.get(WorkoutSession, session_id)
    if workout is None or workout.owner_user_id != owner.id:
        raise HTTPException(404, detail="workout not found")
    notes = session.scalars(
        select(WorkoutExerciseNoteEvent)
        .where(
            WorkoutExerciseNoteEvent.owner_user_id == owner.id,
            WorkoutExerciseNoteEvent.session_id == session_id,
        )
        .order_by(
            WorkoutExerciseNoteEvent.created_at_utc,
            WorkoutExerciseNoteEvent.note_event_id,
        )
        .limit(limit)
    ).all()
    return ExerciseNotePage(items=[_payload(row) for row in notes])
