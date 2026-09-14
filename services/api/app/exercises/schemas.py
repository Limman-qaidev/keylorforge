"""Public response contracts for the exercise catalogue."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class CatalogueReference(BaseModel):
    """A localized catalogue entity identified by a KeylorForge UUID."""

    id: UUID
    name: str


class ExerciseMuscleReference(CatalogueReference):
    """A localized muscle relationship and its participation role."""

    role: str


class ExerciseListItem(BaseModel):
    """The exercise fields required for M2 catalogue listings."""

    id: UUID
    name: str
    measurement_type: str
    difficulty_level: str | None
    category: str | None
    primary_muscles: list[CatalogueReference]
    equipment: list[CatalogueReference]


class ExerciseDetail(ExerciseListItem):
    """Expanded canonical exercise representation for the detail endpoint."""

    force_type: str | None
    mechanics: str | None
    muscles: list[ExerciseMuscleReference]


class ExercisePage(BaseModel):
    """A deterministic page of visible canonical exercises."""

    items: list[ExerciseListItem]
    page: int
    page_size: int
    total: int
    total_pages: int
