"""PostgreSQL read queries for the canonical exercise catalogue."""

from __future__ import annotations

from uuid import UUID

from keylorforge_database.models import (
    CatalogEquipment,
    CatalogEquipmentName,
    CatalogExercise,
    CatalogExerciseEquipment,
    CatalogExerciseMuscle,
    CatalogExerciseName,
    CatalogMuscle,
    CatalogMuscleName,
    ExerciseMuscleRole,
)
from sqlalchemy import ColumnElement, exists, func, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.sql.base import ExecutableOption


class ExerciseCatalogueRepository:
    """Read-only persistence boundary for active system catalogue records."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_exercises(
        self,
        *,
        locale: str,
        search: str | None,
        primary_muscle_id: UUID | None,
        equipment_id: UUID | None,
        offset: int,
        limit: int,
    ) -> tuple[list[CatalogExercise], int]:
        """Return one deterministic page and its duplicate-free total."""
        selected_name = CatalogExerciseName
        filters = self._exercise_filters(
            selected_name=selected_name,
            locale=locale,
            search=search,
            primary_muscle_id=primary_muscle_id,
            equipment_id=equipment_id,
        )
        options = _exercise_options()
        exercises = self._session.scalars(
            select(CatalogExercise)
            .join(selected_name, CatalogExercise.names)
            .where(*filters)
            .options(*options)
            .order_by(selected_name.name.asc(), CatalogExercise.id.asc())
            .offset(offset)
            .limit(limit)
        ).all()
        total = self._session.scalar(
            select(func.count(func.distinct(CatalogExercise.id)))
            .select_from(CatalogExercise)
            .join(selected_name, CatalogExercise.names)
            .where(*filters)
        )
        return list(exercises), total or 0

    def get_visible_exercise(
        self, *, exercise_id: UUID, locale: str
    ) -> CatalogExercise | None:
        """Return one visible system exercise or no result."""
        return self._session.scalar(
            select(CatalogExercise)
            .join(CatalogExerciseName, CatalogExercise.names)
            .where(
                CatalogExercise.id == exercise_id,
                CatalogExercise.is_system.is_(True),
                CatalogExercise.is_active.is_(True),
                CatalogExerciseName.locale == locale,
            )
            .options(*_exercise_options())
        )

    def list_muscles(self, *, locale: str) -> list[CatalogMuscle]:
        """Return normalized muscles ordered by their selected localized name."""
        return list(
            self._session.scalars(
                select(CatalogMuscle)
                .join(CatalogMuscleName, CatalogMuscle.names)
                .where(CatalogMuscleName.locale == locale)
                .options(selectinload(CatalogMuscle.names))
                .order_by(CatalogMuscleName.name.asc(), CatalogMuscle.id.asc())
            ).all()
        )

    def list_equipment(self, *, locale: str) -> list[CatalogEquipment]:
        """Return normalized equipment ordered by its selected localized name."""
        return list(
            self._session.scalars(
                select(CatalogEquipment)
                .join(CatalogEquipmentName, CatalogEquipment.names)
                .where(CatalogEquipmentName.locale == locale)
                .options(selectinload(CatalogEquipment.names))
                .order_by(CatalogEquipmentName.name.asc(), CatalogEquipment.id.asc())
            ).all()
        )

    @staticmethod
    def _exercise_filters(
        *,
        selected_name: type[CatalogExerciseName],
        locale: str,
        search: str | None,
        primary_muscle_id: UUID | None,
        equipment_id: UUID | None,
    ) -> list[ColumnElement[bool]]:
        filters: list[ColumnElement[bool]] = [
            CatalogExercise.is_system.is_(True),
            CatalogExercise.is_active.is_(True),
            selected_name.locale == locale,
        ]
        if search:
            filters.append(
                selected_name.name.ilike(_literal_substring(search), escape="\\")
            )
        if primary_muscle_id is not None:
            filters.append(
                exists(
                    select(CatalogExerciseMuscle.exercise_id).where(
                        CatalogExerciseMuscle.exercise_id == CatalogExercise.id,
                        CatalogExerciseMuscle.muscle_id == primary_muscle_id,
                        CatalogExerciseMuscle.role == ExerciseMuscleRole.PRIMARY,
                    )
                )
            )
        if equipment_id is not None:
            filters.append(
                exists(
                    select(CatalogExerciseEquipment.exercise_id).where(
                        CatalogExerciseEquipment.exercise_id == CatalogExercise.id,
                        CatalogExerciseEquipment.equipment_id == equipment_id,
                    )
                )
            )
        return filters


def _exercise_options() -> tuple[ExecutableOption, ...]:
    return (
        selectinload(CatalogExercise.names),
        selectinload(CatalogExercise.muscles)
        .selectinload(CatalogExerciseMuscle.muscle)
        .selectinload(CatalogMuscle.names),
        selectinload(CatalogExercise.equipment)
        .selectinload(CatalogExerciseEquipment.equipment)
        .selectinload(CatalogEquipment.names),
    )


def _literal_substring(value: str) -> str:
    """Escape SQL LIKE metacharacters so client text remains literal."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
