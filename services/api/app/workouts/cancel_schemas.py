"""Strict offline-first explicit cancellation request/receipt. No row deletion."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class CancelFreeWorkoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    protocol_version: Literal[1]
    kind: Literal["CANCEL_SESSION"]
    session_id: UUID
    mutation_id: UUID
    cancelled_at_utc: AwareDatetime
    confirmed_set_count: int = Field(ge=0)
    discard_performed_sets_confirmed: bool


class CancelFreeWorkoutResponse(BaseModel):
    session_id: UUID
    mutation_id: UUID
    lifecycle_state: Literal["cancelled"]
    cancelled_at: AwareDatetime
    confirmed_set_count: int = Field(ge=0)
