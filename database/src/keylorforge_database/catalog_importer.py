"""Deterministic, offline import of the vendored Kinetic catalogue snapshot."""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from keylorforge_database.models import (
    CatalogEquipment,
    CatalogEquipmentName,
    CatalogExercise,
    CatalogExerciseEquipment,
    CatalogExerciseMuscle,
    CatalogExerciseName,
    CatalogMuscle,
    CatalogMuscleName,
    ExerciseMeasurementType,
    ExerciseMuscleRole,
)


CATALOG_SOURCE = "kinetic-place/exercises-db"
CATALOG_COMMIT = "1783421f145e546fa168c591a0e4d11cae6f23df"
SUPPORTED_LOCALES = ("en", "es")


class CatalogImportError(ValueError):
    """The vendored snapshot cannot safely be imported."""


@dataclass(frozen=True)
class CatalogSnapshot:
    """Raw bilingual entity data from one pinned upstream snapshot."""

    exercises: dict[str, list[dict[str, Any]]]
    muscles: dict[str, list[dict[str, Any]]]
    equipment: dict[str, list[dict[str, Any]]]


@dataclass(frozen=True)
class CatalogImportResult:
    """Deterministic source counts that callers may log or assert."""

    exercises: int
    muscles: int
    equipment: int
    exercise_muscles: int
    exercise_equipment: int


def load_vendored_snapshot(data_root: Path | None = None) -> CatalogSnapshot:
    """Load the packaged data without any network access."""

    root = data_root if data_root is not None else files("keylorforge_database.catalog_data")

    def load(locale: str, name: str) -> list[dict[str, Any]]:
        path = root / locale / name
        try:
            decoded = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise CatalogImportError(f"cannot read {locale}/{name}: {error}") from error
        if not isinstance(decoded, list) or not all(isinstance(item, dict) for item in decoded):
            raise CatalogImportError(f"{locale}/{name} must be a JSON array of objects")
        return decoded

    snapshot = CatalogSnapshot(
        exercises={locale: load(locale, "exercises.json") for locale in SUPPORTED_LOCALES},
        muscles={locale: load(locale, "muscle_groups.json") for locale in SUPPORTED_LOCALES},
        equipment={locale: load(locale, "equipment.json") for locale in SUPPORTED_LOCALES},
    )
    validate_snapshot(snapshot)
    return snapshot


def validate_snapshot(snapshot: CatalogSnapshot) -> None:
    """Validate bilingual parity, required fields and every embedded reference."""

    for collection_name, collections in (
        ("exercises", snapshot.exercises),
        ("muscles", snapshot.muscles),
        ("equipment", snapshot.equipment),
    ):
        if set(collections) != set(SUPPORTED_LOCALES):
            raise CatalogImportError(f"{collection_name} must provide exactly EN and ES")
        ids_by_locale: dict[str, set[str]] = {}
        for locale in SUPPORTED_LOCALES:
            items = collections[locale]
            ids = {_required_string(item, "id", f"{collection_name}/{locale}") for item in items}
            if len(ids) != len(items):
                raise CatalogImportError(f"{collection_name}/{locale} has duplicate source IDs")
            for item in items:
                _required_string(item, "name", f"{collection_name}/{locale}")
            ids_by_locale[locale] = ids
        if ids_by_locale["en"] != ids_by_locale["es"]:
            raise CatalogImportError(f"{collection_name} EN/ES source IDs differ")

    muscle_ids = {_required_string(item, "id", "muscles/en") for item in snapshot.muscles["en"]}
    equipment_ids = {_required_string(item, "id", "equipment/en") for item in snapshot.equipment["en"]}
    for muscle in snapshot.muscles["en"]:
        _required_string(muscle, "slug", "muscles/en")
    for locale in SUPPORTED_LOCALES:
        for item in snapshot.exercises[locale]:
            _validate_exercise(item, locale, muscle_ids, equipment_ids)


def import_vendored_catalog(
    session: Session, snapshot: CatalogSnapshot | None = None
) -> CatalogImportResult:
    """Upsert one validated snapshot using application-owned primary keys."""

    data = snapshot if snapshot is not None else load_vendored_snapshot()
    validate_snapshot(data)

    muscles = _upsert_muscles(session, data)
    equipment = _upsert_equipment(session, data)
    exercises = _upsert_exercises(session, data)
    session.flush()
    relation_counts = _upsert_relations(session, data, exercises, muscles, equipment)
    session.flush()
    return CatalogImportResult(
        exercises=len(exercises),
        muscles=len(muscles),
        equipment=len(equipment),
        exercise_muscles=relation_counts[0],
        exercise_equipment=relation_counts[1],
    )


def _upsert_muscles(session: Session, data: CatalogSnapshot) -> dict[str, CatalogMuscle]:
    result: dict[str, CatalogMuscle] = {}
    localized = {locale: _by_id(data.muscles[locale]) for locale in SUPPORTED_LOCALES}
    for source_id in sorted(localized["en"]):
        english = localized["en"][source_id]
        muscle = session.scalar(
            select(CatalogMuscle).where(
                CatalogMuscle.source == CATALOG_SOURCE, CatalogMuscle.source_id == source_id
            )
        )
        if muscle is None:
            muscle = CatalogMuscle(source=CATALOG_SOURCE, source_id=source_id, slug=english["slug"])
            session.add(muscle)
        else:
            muscle.slug = english["slug"]
        _upsert_name(session, CatalogMuscleName, "muscle_id", muscle, localized, source_id)
        result[source_id] = muscle
    return result


def _upsert_equipment(session: Session, data: CatalogSnapshot) -> dict[str, CatalogEquipment]:
    result: dict[str, CatalogEquipment] = {}
    localized = {locale: _by_id(data.equipment[locale]) for locale in SUPPORTED_LOCALES}
    for source_id in sorted(localized["en"]):
        english = localized["en"][source_id]
        equipment = session.scalar(
            select(CatalogEquipment).where(
                CatalogEquipment.source == CATALOG_SOURCE,
                CatalogEquipment.source_id == source_id,
            )
        )
        if equipment is None:
            equipment = CatalogEquipment(source=CATALOG_SOURCE, source_id=source_id)
            session.add(equipment)
        equipment.equipment_type = _optional_string(english, "type")
        equipment.usage_type = _optional_string(english, "usageType")
        _upsert_name(session, CatalogEquipmentName, "equipment_id", equipment, localized, source_id)
        result[source_id] = equipment
    return result


def _upsert_exercises(session: Session, data: CatalogSnapshot) -> dict[str, CatalogExercise]:
    result: dict[str, CatalogExercise] = {}
    localized = {locale: _by_id(data.exercises[locale]) for locale in SUPPORTED_LOCALES}
    for source_id in sorted(localized["en"]):
        english = localized["en"][source_id]
        exercise = session.scalar(
            select(CatalogExercise).where(
                CatalogExercise.source == CATALOG_SOURCE, CatalogExercise.source_id == source_id
            )
        )
        if exercise is None:
            exercise = CatalogExercise(source=CATALOG_SOURCE, source_id=source_id)
            session.add(exercise)
        exercise.measurement_type = ExerciseMeasurementType(english["type"])
        exercise.difficulty_level = _optional_string(english, "difficultyLevel")
        exercise.force_type = _optional_string(english, "forceType")
        exercise.mechanics = _optional_string(english, "mechanics")
        exercise.category = _optional_string(english, "category")
        _upsert_name(session, CatalogExerciseName, "exercise_id", exercise, localized, source_id)
        result[source_id] = exercise
    return result


def _upsert_name(
    session: Session,
    model: type[CatalogExerciseName] | type[CatalogMuscleName] | type[CatalogEquipmentName],
    foreign_key: str,
    entity: CatalogExercise | CatalogMuscle | CatalogEquipment,
    localized: dict[str, dict[str, dict[str, Any]]],
    source_id: str,
) -> None:
    # SQLAlchemy assigns UUID column defaults during INSERT, not object creation.
    # Flush the parent first so composite name keys always use an application ID.
    if entity.id is None:
        session.flush()
    for locale in SUPPORTED_LOCALES:
        identity = {foreign_key: entity.id, "locale": locale}
        name = session.get(model, identity)
        if name is None:
            name = model(**identity, name=localized[locale][source_id]["name"])
            session.add(name)
        else:
            name.name = localized[locale][source_id]["name"]


def _upsert_relations(
    session: Session,
    data: CatalogSnapshot,
    exercises: dict[str, CatalogExercise],
    muscles: dict[str, CatalogMuscle],
    equipment: dict[str, CatalogEquipment],
) -> tuple[int, int]:
    muscle_count = 0
    equipment_count = 0
    for item in sorted(data.exercises["en"], key=lambda exercise: exercise["id"]):
        exercise = exercises[item["id"]]

        muscle_references = _normalized_muscle_references(item["muscleGroups"])
        desired_muscle_ids = {muscles[reference["id"]].id for reference in muscle_references}
        existing_muscles = session.scalars(
            select(CatalogExerciseMuscle).where(
                CatalogExerciseMuscle.exercise_id == exercise.id
            )
        ).all()
        for association in existing_muscles:
            if association.muscle_id not in desired_muscle_ids:
                session.delete(association)

        for reference in muscle_references:
            muscle = muscles[reference["id"]]
            association = session.get(
                CatalogExerciseMuscle, {"exercise_id": exercise.id, "muscle_id": muscle.id}
            )
            if association is None:
                association = CatalogExerciseMuscle(exercise=exercise, muscle=muscle)
                session.add(association)
            association.role = ExerciseMuscleRole(reference["type"])
            muscle_count += 1

        equipment_references = sorted(item["equipment"], key=lambda entry: entry["id"])
        desired_equipment_ids = {
            equipment[reference["id"]].id for reference in equipment_references
        }
        existing_equipment = session.scalars(
            select(CatalogExerciseEquipment).where(
                CatalogExerciseEquipment.exercise_id == exercise.id
            )
        ).all()
        for association in existing_equipment:
            if association.equipment_id not in desired_equipment_ids:
                session.delete(association)

        for reference in equipment_references:
            item_equipment = equipment[reference["id"]]
            association = session.get(
                CatalogExerciseEquipment,
                {"exercise_id": exercise.id, "equipment_id": item_equipment.id},
            )
            if association is None:
                session.add(CatalogExerciseEquipment(exercise=exercise, equipment=item_equipment))
            equipment_count += 1
    return muscle_count, equipment_count


def _validate_exercise(
    item: dict[str, Any], locale: str, muscle_ids: set[str], equipment_ids: set[str]
) -> None:
    context = f"exercises/{locale}"
    _required_string(item, "id", context)
    _required_string(item, "name", context)
    measurement = _required_string(item, "type", context)
    if measurement not in {member.value for member in ExerciseMeasurementType}:
        raise CatalogImportError(f"{context} has unsupported measurement type {measurement!r}")
    for field in ("difficultyLevel", "forceType", "mechanics", "category"):
        _optional_string(item, field)
    _validate_references(item, "muscleGroups", muscle_ids, context, require_role=True)
    _validate_references(item, "equipment", equipment_ids, context, require_role=False)


def _validate_references(
    item: dict[str, Any], field: str, known_ids: set[str], context: str, require_role: bool
) -> None:
    references = item.get(field)
    if not isinstance(references, list):
        raise CatalogImportError(f"{context}.{field} must be a list")
    ids: set[str] = set()
    roles_by_id: dict[str, set[str]] = {}
    for reference in references:
        if not isinstance(reference, dict):
            raise CatalogImportError(f"{context}.{field} must contain objects")
        source_id = _required_string(reference, "id", f"{context}.{field}")
        if source_id not in known_ids:
            raise CatalogImportError(f"{context}.{field} references unknown ID {source_id}")
        if source_id in ids and not require_role:
            raise CatalogImportError(f"{context}.{field} repeats ID {source_id}")
        ids.add(source_id)
        if require_role:
            role = _required_string(reference, "type", f"{context}.{field}")
            if role not in {member.value for member in ExerciseMuscleRole}:
                raise CatalogImportError(f"{context}.{field} has unsupported role {role!r}")
            seen_roles = roles_by_id.setdefault(source_id, set())
            if role in seen_roles:
                raise CatalogImportError(f"{context}.{field} repeats {source_id} with role {role}")
            seen_roles.add(role)


def _normalized_muscle_references(references: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse upstream duplicate IDs, retaining the most specific role.

    The pinned Kinetic snapshot contains a small number of primary/secondary
    duplicates for the same muscle. The relational primary key intentionally
    permits one row per exercise-muscle pair, so primary takes precedence over
    secondary and tertiary deterministically.
    """

    rank = {
        ExerciseMuscleRole.PRIMARY.value: 0,
        ExerciseMuscleRole.SECONDARY.value: 1,
        ExerciseMuscleRole.TERTIARY.value: 2,
    }
    normalized: dict[str, dict[str, Any]] = {}
    for reference in references:
        source_id = reference["id"]
        existing = normalized.get(source_id)
        if existing is None or rank[reference["type"]] < rank[existing["type"]]:
            normalized[source_id] = reference
    return [normalized[source_id] for source_id in sorted(normalized)]


def _required_string(item: dict[str, Any], field: str, context: str) -> str:
    value = item.get(field)
    if not isinstance(value, str) or not value:
        raise CatalogImportError(f"{context}.{field} must be a non-empty string")
    return value


def _optional_string(item: dict[str, Any], field: str) -> str | None:
    value = item.get(field)
    if value is not None and not isinstance(value, str):
        raise CatalogImportError(f"{field} must be a string or null")
    return value


def _by_id(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in items}
