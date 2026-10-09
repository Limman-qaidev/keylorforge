"""Validated M3 performed-set semantic commands; not a mobile sync worker."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

DECIMAL_PATTERN = r"^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$"


class RepsMeasurement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    measurementType: Literal["reps"]
    reps: int = Field(gt=0, le=2_147_483_647)


class TimeMeasurement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    measurementType: Literal["time"]
    durationSeconds: int = Field(gt=0, le=2_147_483_647)


class DistanceMeasurement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    measurementType: Literal["distance"]
    distanceDecimal: str = Field(pattern=DECIMAL_PATTERN)
    distanceUnit: Literal["m", "km", "mi"]

    @field_validator("distanceDecimal")
    @classmethod
    def positive_distance(cls, value: str) -> str:
        if not any(char != "0" and char != "." for char in value):
            raise ValueError("distance must be positive")
        return value


PerformedMeasurement = Annotated[
    RepsMeasurement | TimeMeasurement | DistanceMeasurement,
    Field(discriminator="measurementType"),
]


class NativeLoad(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decimal: str = Field(pattern=DECIMAL_PATTERN)
    unit: Literal["kg", "lb"]
    entrySemantics: Literal["total", "per_implement", "machine_display", "assistance"]


class MachineAtSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profileId: UUID
    configurationId: UUID | None = None
    snapshot: dict[str, object]


class _ConfirmPerformedSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    protocol_version: Literal[1]
    session_id: UUID
    mutation_id: UUID
    set_id: UUID
    occurrence_id: UUID
    canonical_exercise_id: UUID
    agenda_item_id: UUID | None
    actual_order: int = Field(ge=0, le=2_147_483_647)
    set_role: Literal["WARMUP", "WORKING"]
    measurement: PerformedMeasurement
    load: NativeLoad | None
    machine: MachineAtSet | None
    target_at_confirmation: dict[str, object] | None
    completed_at: AwareDatetime


class ConfirmFirstSetRequest(_ConfirmPerformedSet):
    kind: Literal["CONFIRM_FIRST_SET_WITH_OCCURRENCE"]


class ConfirmAdditionalSetRequest(_ConfirmPerformedSet):
    kind: Literal["CONFIRM_ADDITIONAL_SET"]


class ConfirmedSetResponse(BaseModel):
    """Acknowledgement only after committed server mutation transaction."""

    session_id: UUID
    occurrence_id: UUID
    set_id: UUID
    mutation_id: UUID
    set_role: str
    measurement_type: str
    completed_at: datetime
    load_decimal: str | None
    load_unit: str | None
    machine_profile_id: UUID | None
