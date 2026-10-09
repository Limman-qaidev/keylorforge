"""Strict, owner-relative Machine Profile and Configuration contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreateMachineProfileRequest(BaseModel):
    """Client-ID-stable CREATE_MACHINE_PROFILE; technical fields are optional."""

    model_config = ConfigDict(extra="forbid")

    protocol_version: Literal[1]
    kind: Literal["CREATE_MACHINE_PROFILE"]
    mutation_id: UUID
    profile_id: UUID
    nickname: str = Field(min_length=1, max_length=120)
    catalog_equipment_id: UUID | None = None
    manufacturer: str | None = Field(default=None, max_length=120)
    model_name: str | None = Field(default=None, max_length=120)
    native_load_unit: Literal["kg", "lb"] | None = None
    load_entry_semantics: Literal[
        "total", "per_implement", "machine_display", "assistance"
    ] | None = None
    technical_metadata: dict[str, object] = Field(default_factory=dict)
    # User-supplied data is only user-entered evidence, not verified manufacturer
    # evidence or a general conversion ratio for analytical comparison.
    metadata_source: Literal["user_entered"] = "user_entered"

    @field_validator("nickname")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("nickname cannot be blank")
        return value


class CreateMachineConfigurationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    protocol_version: Literal[1]
    kind: Literal["CREATE_MACHINE_CONFIGURATION"]
    mutation_id: UUID
    configuration_id: UUID
    profile_id: UUID
    label: str = Field(min_length=1, max_length=120)
    material_setup: dict[str, object]
    metadata_source: Literal["user_entered"] = "user_entered"

    @field_validator("label")
    @classmethod
    def nonblank_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("configuration label cannot be blank")
        return value


class MachineProfileResponse(BaseModel):
    id: UUID
    nickname: str
    catalog_equipment_id: UUID | None
    manufacturer: str | None
    model_name: str | None
    native_load_unit: str | None
    load_entry_semantics: str | None
    technical_metadata: dict[str, object]
    metadata_source: str | None
    created_at: datetime


class MachineConfigurationResponse(BaseModel):
    id: UUID
    profile_id: UUID
    label: str
    material_setup: dict[str, object]
    metadata_source: str | None
    created_at: datetime
