"""Strict START_SESSION request and read-only session acknowledgement schemas."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal, Self
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator


class StartFreeWorkoutRequest(BaseModel):
    """The offline-first client chooses stable IDs and its actual start instant."""

    model_config = ConfigDict(extra="forbid")

    protocol_version: Literal[1]
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

    @model_validator(mode="after")
    def safe_session_start_instant(self) -> Self:
        """Guard UTC/local conversion and historical offset bounds before DB I/O."""
        try:
            instant = self.started_at.astimezone(UTC)
            local = instant.astimezone(ZoneInfo(self.time_zone))
            offset = local.utcoffset()
        except (OverflowError, ValueError) as exc:
            raise ValueError("started_at outside supported timezone range") from exc
        if offset is None or not -840 <= offset.total_seconds() / 60 <= 840:
            raise ValueError("started_at yields unsupported timezone offset")
        return self


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
