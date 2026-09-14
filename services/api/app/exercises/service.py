"""Catalogue response mapping and application-level query rules."""

from __future__ import annotations

from collections.abc import Sequence
from math import ceil
from uuid import UUID

from fastapi import HTTPException, status
from keylorforge_database.models import (
    CatalogEquipmentName,
    CatalogExercise,
    CatalogExerciseName,
    CatalogMuscleName,
)
from sqlalchemy.orm import Session

from app.exercises.repository import ExerciseCatalogueRepository
from app.exercises.schemas import (
    CatalogueReference,
    ExerciseDetail,
    ExerciseListItem,
    ExerciseMuscleReference,
    ExercisePage,
)


def list_exercises(
    *,
    session: Session,
    locale: str,
    search: str | None,
    primary_muscle_id: UUID | None,
    equipment_id: UUID | None,
    page: int,
    page_size: int,
) -> ExercisePage:
    """Return a deterministic page of visible canonical exercises."""
    exercises, total = ExerciseCatalogueRepository(session).list_exercises(
        locale=locale,
        search=search,
        primary_muscle_id=primary_muscle_id,
        equipment_id=equipment_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return ExercisePage(
        items=[_list_item(exercise, locale) for exercise in exercises],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=ceil(total / page_size) if total else 0,
    )


def get_exercise(*, session: Session, exercise_id: UUID, locale: str) -> ExerciseDetail:
    """Return one visible canonical exercise or the public not-found response."""
    exercise = ExerciseCatalogueRepository(session).get_visible_exercise(
        exercise_id=exercise_id, locale=locale
    )
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="exercise not found"
        )
    item = _list_item(exercise, locale)
    return ExerciseDetail(
        **item.model_dump(),
        force_type=exercise.force_type,
        mechanics=exercise.mechanics,
        muscles=[
            ExerciseMuscleReference(
                id=association.muscle.id,
                name=_localized_name(association.muscle.names, locale),
                role=association.role.value,
            )
            for association in sorted(
                exercise.muscles,
                key=lambda association: (
                    _localized_name(association.muscle.names, locale),
                    str(association.muscle.id),
                ),
            )
        ],
    )


def list_muscles(*, session: Session, locale: str) -> list[CatalogueReference]:
    """Map normalized muscles to their localized public references."""
    return [
        CatalogueReference(id=muscle.id, name=_localized_name(muscle.names, locale))
        for muscle in ExerciseCatalogueRepository(session).list_muscles(locale=locale)
    ]


def list_equipment(*, session: Session, locale: str) -> list[CatalogueReference]:
    """Map normalized equipment to their localized public references."""
    return [
        CatalogueReference(id=item.id, name=_localized_name(item.names, locale))
        for item in ExerciseCatalogueRepository(session).list_equipment(locale=locale)
    ]


def _list_item(exercise: CatalogExercise, locale: str) -> ExerciseListItem:
    return ExerciseListItem(
        id=exercise.id,
        name=_localized_name(exercise.names, locale),
        measurement_type=exercise.measurement_type.value,
        difficulty_level=exercise.difficulty_level,
        category=exercise.category,
        primary_muscles=[
            CatalogueReference(
                id=association.muscle.id,
                name=_localized_name(association.muscle.names, locale),
            )
            for association in sorted(
                (item for item in exercise.muscles if item.role.value == "primary"),
                key=lambda association: (
                    _localized_name(association.muscle.names, locale),
                    str(association.muscle.id),
                ),
            )
        ],
        equipment=[
            CatalogueReference(
                id=association.equipment.id,
                name=_localized_name(association.equipment.names, locale),
            )
            for association in sorted(
                exercise.equipment,
                key=lambda association: (
                    _localized_name(association.equipment.names, locale),
                    str(association.equipment.id),
                ),
            )
        ],
    )


def _localized_name(
    names: Sequence[CatalogExerciseName | CatalogMuscleName | CatalogEquipmentName],
    locale: str,
) -> str:
    for name in names:
        if name.locale == locale:
            return name.name
    raise RuntimeError(f"catalogue data is missing the {locale!r} localized name")
