"""Reviewed, deterministic identity curation layered over the pinned Kinetic source.

The upstream bilingual snapshot remains byte-for-byte intact. Each source UUID
continues to have its own immutable KeylorForge row and provenance, but the
recorded true semantic aliases resolve to one canonical application identity.
The intentionally different skipping/leap exercises are never merged.
"""

from __future__ import annotations

from typing import Any

# alias upstream UUID -> canonical upstream UUID. Reviewed in CAT-FUP #89.
CANONICAL_SOURCE_ALIASES: dict[str, str] = {
    "710d2013-c457-4b36-afff-bd1e0d4ee129": "3fade67e-d00a-4428-8c59-1be4e62779bf",
    "95bc6cf9-f5f0-42bc-8f22-1f4b825257b7": "b921879c-7b32-45b4-9d4c-06456223b2ef",
}

# Spanish *display* curation; never mutate the vendored Kinetic snapshot.
SPANISH_NAME_OVERRIDES: dict[str, str] = {
    "dc59aedc-619a-4b9b-9806-6aae4d913496": "Skipping rápido",
    "274698d4-0a8e-47d6-8a85-d279729dc657": "Salto rápido",
}


def validate_catalogue_curation(exercises: dict[str, list[dict[str, Any]]]) -> None:
    """Fail closed if the pinned source changes semantic alias relationships."""
    en = {exercise["id"]: exercise for exercise in exercises["en"]}
    es = {exercise["id"]: exercise for exercise in exercises["es"]}
    for alias_id, canonical_id in CANONICAL_SOURCE_ALIASES.items():
        if alias_id == canonical_id or canonical_id in CANONICAL_SOURCE_ALIASES:
            raise ValueError("catalogue alias redirect must point directly to a canonical row")
        if alias_id not in en or canonical_id not in en:
            raise ValueError("reviewed catalogue source alias is missing")
        for locale in (en, es):
            alias, canonical = locale[alias_id], locale[canonical_id]
            for key in ("type", "difficultyLevel", "forceType", "mechanics", "category"):
                if alias.get(key) != canonical.get(key):
                    raise ValueError(f"reviewed alias {alias_id} differs on {key}")
            if _relations(alias, "muscleGroups") != _relations(canonical, "muscleGroups"):
                raise ValueError(f"reviewed alias {alias_id} has distinct muscle relationships")
            if _relations(alias, "equipment") != _relations(canonical, "equipment"):
                raise ValueError(f"reviewed alias {alias_id} has distinct equipment relationships")
    if not SPANISH_NAME_OVERRIDES.keys() <= es.keys():
        raise ValueError("reviewed Spanish display override refers to a missing source ID")
    if len(set(SPANISH_NAME_OVERRIDES.values())) != len(SPANISH_NAME_OVERRIDES):
        raise ValueError("curated Spanish display labels must be distinct")


def _relations(exercise: dict[str, Any], field: str) -> set[tuple[str, str]]:
    """Compare relationships by semantic identity rather than source ordering."""
    return {
        (str(reference["id"]), str(reference.get("type", "")))
        for reference in exercise[field]
    }
