"""PostgreSQL integration coverage for the exercise catalogue repository."""

from __future__ import annotations

import os

import pytest
from keylorforge_database.catalog_importer import import_vendored_catalog
from keylorforge_database.models import (
    Base,
    CatalogEquipment,
    CatalogExercise,
    CatalogMuscle,
    ExerciseMuscleRole,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.exercises.repository import ExerciseCatalogueRepository

CatalogNamedEntity = CatalogExercise | CatalogMuscle | CatalogEquipment


def _localized_name(entity: CatalogNamedEntity, locale: str) -> str:
    return next(name.name for name in entity.names if name.locale == locale)


def test_catalogue_repository_queries_run_against_postgresql() -> None:
    """Exercise search/filter/detail queries execute with real PostgreSQL semantics."""
    database_url = os.getenv("KEYLORFORGE_TEST_DATABASE_URL")
    if database_url is None:
        pytest.skip(
            "KEYLORFORGE_TEST_DATABASE_URL is required for PostgreSQL integration"
        )

    engine = create_engine(database_url)
    try:
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)

        with Session(engine) as session:
            imported = import_vendored_catalog(session)
            session.commit()
            assert imported.exercises == 899

        with Session(engine) as session:
            repository = ExerciseCatalogueRepository(session)

            first_page, total = repository.list_exercises(
                locale="es",
                search=None,
                primary_muscle_id=None,
                equipment_id=None,
                offset=0,
                limit=30,
            )
            repeated_page, repeated_total = repository.list_exercises(
                locale="es",
                search=None,
                primary_muscle_id=None,
                equipment_id=None,
                offset=0,
                limit=30,
            )
            assert total == repeated_total == 899
            assert len(first_page) == 30
            assert [exercise.id for exercise in first_page] == [
                exercise.id for exercise in repeated_page
            ]

            all_exercises, all_total = repository.list_exercises(
                locale="es",
                search=None,
                primary_muscle_id=None,
                equipment_id=None,
                offset=0,
                limit=1000,
            )
            assert all_total == len(all_exercises) == 899

            selected = next(
                exercise
                for exercise in all_exercises
                if any(
                    relation.role is ExerciseMuscleRole.PRIMARY
                    for relation in exercise.muscles
                )
                and exercise.equipment
            )
            selected_name = _localized_name(selected, "es")
            primary_muscle_id = next(
                relation.muscle_id
                for relation in selected.muscles
                if relation.role is ExerciseMuscleRole.PRIMARY
            )
            equipment_id = selected.equipment[0].equipment_id

            search_results, search_total = repository.list_exercises(
                locale="es",
                search=selected_name.upper(),
                primary_muscle_id=None,
                equipment_id=None,
                offset=0,
                limit=1000,
            )
            assert search_total == len(search_results)
            assert selected.id in {exercise.id for exercise in search_results}

            muscle_results, muscle_total = repository.list_exercises(
                locale="es",
                search=None,
                primary_muscle_id=primary_muscle_id,
                equipment_id=None,
                offset=0,
                limit=1000,
            )
            assert muscle_total == len(muscle_results)
            assert selected.id in {exercise.id for exercise in muscle_results}
            assert all(
                any(
                    relation.muscle_id == primary_muscle_id
                    and relation.role is ExerciseMuscleRole.PRIMARY
                    for relation in exercise.muscles
                )
                for exercise in muscle_results
            )

            equipment_results, equipment_total = repository.list_exercises(
                locale="es",
                search=None,
                primary_muscle_id=None,
                equipment_id=equipment_id,
                offset=0,
                limit=1000,
            )
            assert equipment_total == len(equipment_results)
            assert selected.id in {exercise.id for exercise in equipment_results}
            assert all(
                any(
                    relation.equipment_id == equipment_id
                    for relation in exercise.equipment
                )
                for exercise in equipment_results
            )

            combined_results, combined_total = repository.list_exercises(
                locale="es",
                search=None,
                primary_muscle_id=primary_muscle_id,
                equipment_id=equipment_id,
                offset=0,
                limit=1000,
            )
            assert combined_total == len(combined_results)
            assert selected.id in {exercise.id for exercise in combined_results}
            assert len({exercise.id for exercise in combined_results}) == combined_total

            visible = repository.get_visible_exercise(
                exercise_id=selected.id, locale="es"
            )
            assert visible is not None
            selected.is_active = False
            session.flush()
            assert (
                repository.get_visible_exercise(exercise_id=selected.id, locale="es")
                is None
            )

            muscles = repository.list_muscles(locale="es")
            equipment = repository.list_equipment(locale="es")
            assert len(muscles) == 17
            assert len(equipment) == 36
            assert all(_localized_name(muscle, "es") for muscle in muscles)
            assert all(_localized_name(item, "es") for item in equipment)
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
