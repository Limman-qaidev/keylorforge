"""Public contracts for caller-relative identity endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class ProfileResponse(BaseModel):
    """The caller-owned profile representation exposed by the API."""

    display_name: str | None
    created_at: datetime
    updated_at: datetime


class UpdateProfileRequest(BaseModel):
    """The caller-owned profile fields editable during M1."""

    model_config = ConfigDict(extra="forbid")

    display_name: str

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        """Trim the supplied name and enforce the public profile contract."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("display_name must not be empty")
        if "\x00" in normalized:
            raise ValueError("display_name must not contain NUL characters")
        if len(normalized) > 80:
            raise ValueError("display_name must be at most 80 characters")
        return normalized


class MeResponse(BaseModel):
    """The active caller's own KeylorFit identity and profile foundation."""

    id: UUID
    profile: ProfileResponse
