"""Regression coverage for deterministic catalogue snapshot refreshes."""

from __future__ import annotations

from copy import deepcopy

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from keylorforge_database.catalog_importer import import_vendored_catalog, load_vendored_snapshot
from keylorforge_database.models import (
    CatalogExercise,
    CatalogExerciseEquipment,
    CatalogExerciseMuscle,
)


def test_catalog_refresh_removes_stale_source_associations(test_database_url: str) -> None:
    """A refreshed source snapshot replaces, rather than accumulates, its relationships."""
    command.upgrade(Config("alembic.ini"), "head")
    original = load_vendored_snapshot()
    refreshed = deepcopy(original)

    candidate = next(
        item
        for item in refreshed.exercises["en"]
        if len(item["muscleGroups"]) > 1 and len(item["equipment"]) > 0
    )
    source_id = candidate["id"]
    expected_muscles = len({reference["id"] for reference in candidate["muscleGroups"]}) - 1
    candidate["muscleGroups"] = candidate["muscleGroups"][1:]
    candidate["equipment"] = []

    localized_candidate = next(
        item for item in refreshed.exercises["es"] if item["id"] == source_id
    )
    removed_muscle_id = original.exercises["en"][
        next(
            index
            for index, item in enumerate(original.exercises["en"])
            if item["id"] == source_id
        )
    ]["muscleGroups"][0]["id"]
    localized_candidate["muscleGroups"] = [
        reference
        for reference in localized_candidate["muscleGroups"]
        if reference["id"] != removed_muscle_id
    ]
    localized_candidate["equipment"] = []

    engine = create_engine(test_database_url)
    try:
        with Session(engine) as session:
            import_vendored_catalog(session, original)
            session.commit()

        with Session(engine) as session:
            import_vendored_catalog(session, refreshed)
            session.commit()

        with Session(engine) as session:
            exercise_id = session.scalar(
                select(CatalogExercise.id).where(CatalogExercise.source_id == source_id)
            )
            muscle_rows = session.scalars(
                select(CatalogExerciseMuscle).where(
                    CatalogExerciseMuscle.exercise_id == exercise_id
                )
            ).all()
            equipment_rows = session.scalars(
                select(CatalogExerciseEquipment).where(
                    CatalogExerciseEquipment.exercise_id == exercise_id
                )
            ).all()

        assert len(muscle_rows) == expected_muscles
        assert equipment_rows == []
    finally:
        engine.dispose()
