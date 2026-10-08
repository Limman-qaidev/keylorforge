"""PostgreSQL integration coverage for the exercise catalogue repository."""

from __future__ import annotations

import os

import pytest
from keylorforge_database.catalog_importer import import_vendored_catalog
from keylorforge_database.catalog_curation import CANONICAL_SOURCE_ALIASES, SPANISH_NAME_OVERRIDES
from keylorforge_database.models import (
    Base,
    CatalogEquipment,
    CatalogExercise,
    CatalogMuscle,
    ExerciseMuscleRole,
)
from sqlalchemy import create_engine, select
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
            assert total == repeated_total == 897
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
            assert all_total == len(all_exercises) == 897

            # All 899 upstream records remain, but true aliases only appear
            # under their stable canonical KeylorForge exercise identity.
            for source_alias_id, source_canonical_id in CANONICAL_SOURCE_ALIASES.items():
                alias = session.scalar(
                    select(CatalogExercise).where(CatalogExercise.source_id == source_alias_id)
                )
                canonical = session.scalar(
                    select(CatalogExercise).where(
                        CatalogExercise.source_id == source_canonical_id
                    )
                )
                assert alias is not None and canonical is not None
                assert alias.id != canonical.id
                assert alias.canonical_exercise_id == canonical.id
                resolved = repository.get_visible_exercise(exercise_id=alias.id, locale="es")
                assert resolved is not None and resolved.id == canonical.id
                assert alias.id in {entry.id for entry in canonical.alias_records}
                assert alias.id not in {item.id for item in all_exercises}

                alias_name_en = _localized_name(alias, "en")
                english_results, english_total = repository.list_exercises(
                    locale="en", search=alias_name_en,
                    primary_muscle_id=None, equipment_id=None,
                    offset=0, limit=1000,
                )
                assert english_total == len(english_results)
                assert canonical.id in {item.id for item in english_results}

            for source_id, expected_es_name in SPANISH_NAME_OVERRIDES.items():
                exercise = session.scalar(
                    select(CatalogExercise).where(CatalogExercise.source_id == source_id)
                )
                assert exercise is not None
                assert _localized_name(exercise, "es") == expected_es_name
                results, count = repository.list_exercises(
                    locale="es", search=expected_es_name,
                    primary_muscle_id=None, equipment_id=None,
                    offset=0, limit=1000,
                )
                assert count == len(results) == 1
                assert results[0].id == exercise.id
            assert SPANISH_NAME_OVERRIDES.keys().isdisjoint(
                CANONICAL_SOURCE_ALIASES.keys()
            )

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
