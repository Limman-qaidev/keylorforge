"""Public contracts for caller-relative identity endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ProfileFoundationResponse(BaseModel):
    """The intentionally minimal application-owned profile foundation."""

    created_at: datetime
    updated_at: datetime


class MeResponse(BaseModel):
    """The active caller's own Keylornet identity and profile foundation."""

    id: UUID
    profile: ProfileFoundationResponse
