"""Strict immutable Free Workout FINISH intent (no inferred agenda history)."""

from __future__ import annotations

from datetime import date
from typing import Literal, Self
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


class EmptyFreeAgenda(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    origin: Literal["free"]
    items: list[object]

    @model_validator(mode="after")
    def only_unmodified_free_agenda(self) -> Self:
        if self.items:
            raise ValueError("applied agenda changes not yet supported")
        return self


class PerformedOccurrenceAtFinish(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurrence_id: UUID
    canonical_exercise_id: UUID
    actual_order: int = Field(ge=0)
    agenda_item_id: None
    set_ids: list[UUID] = Field(min_length=1)


class FreeWorkoutCompletionSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    completion_snapshot_id: UUID
    session_id: UUID
    origin: Literal["free"]
    original_agenda: EmptyFreeAgenda
    final_agenda_revision: Literal[0]
    applied_agenda_change_ids: list[UUID]
    agenda_items: list[object]
    unplanned_performed_occurrences: list[PerformedOccurrenceAtFinish] = Field(
        min_length=1
    )
    finished_at_utc: AwareDatetime
    time_zone: str = Field(min_length=1, max_length=64)
    local_date: date

    @model_validator(mode="after")
    def no_invented_history(self) -> Self:
        if self.applied_agenda_change_ids or self.agenda_items:
            raise ValueError("material agenda changes not yet supported")
        seen_occurrences: set[UUID] = set()
        seen_sets: set[UUID] = set()
        for occurrence in self.unplanned_performed_occurrences:
            if occurrence.occurrence_id in seen_occurrences:
                raise ValueError("duplicate completed occurrence")
            seen_occurrences.add(occurrence.occurrence_id)
            for set_id in occurrence.set_ids:
                if set_id in seen_sets:
                    raise ValueError("duplicate performed set")
                seen_sets.add(set_id)
        return self


class FinishFreeWorkoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    protocol_version: Literal[1]
    kind: Literal["FINISH_SESSION"]
    session_id: UUID
    mutation_id: UUID
    completion_snapshot: FreeWorkoutCompletionSnapshot

    @model_validator(mode="after")
    def consistent_session_identity(self) -> Self:
        if self.completion_snapshot.session_id != self.session_id:
            raise ValueError("completion snapshot session ID mismatch")
        return self


class FinishFreeWorkoutResponse(BaseModel):
    session_id: UUID
    mutation_id: UUID
    completion_snapshot_id: UUID
    lifecycle_state: Literal["completed"]
    completed_at: AwareDatetime
