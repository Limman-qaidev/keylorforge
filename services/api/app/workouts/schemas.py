"""Strict START_SESSION request and read-only session acknowledgement schemas."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class StartFreeWorkoutRequest(BaseModel):
    """The offline-first client chooses stable IDs and its actual start instant."""

    model_config = ConfigDict(extra="forbid")

    session_id: UUID
    mutation_id: UUID
    started_at: AwareDatetime
    time_zone: str = Field(min_length=1, max_length=64)

    @field_validator("time_zone")
    @classmethod
    def valid_iana_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("time_zone must be a valid IANA zone") from exc
        return value


class WorkoutSessionResponse(BaseModel):
    """Owner-scoped session state without user IDs or mutable prescription bytes."""

    id: UUID
    origin: str
    lifecycle_state: str
    started_at: datetime
    time_zone: str
    utc_offset_minutes: int
    local_date: date
    agenda_revision: int
