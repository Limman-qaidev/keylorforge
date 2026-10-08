"""Pure QA of reviewed upstream alias decisions without a database connection."""

from __future__ import annotations

from copy import deepcopy

import pytest

from keylorforge_database.catalog_curation import (
    CANONICAL_SOURCE_ALIASES,
    SPANISH_NAME_OVERRIDES,
    validate_catalogue_curation,
)
from keylorforge_database.catalog_importer import load_vendored_snapshot


def test_reviewed_aliases_match_pinned_bilingual_source_relationships() -> None:
    snapshot = load_vendored_snapshot()
    validate_catalogue_curation(snapshot.exercises)
    assert len(CANONICAL_SOURCE_ALIASES) == 2
    assert len(SPANISH_NAME_OVERRIDES) == 2
    assert not set(CANONICAL_SOURCE_ALIASES) & set(SPANISH_NAME_OVERRIDES)

    english = {item["id"]: item for item in snapshot.exercises["en"]}
    spanish = {item["id"]: item for item in snapshot.exercises["es"]}
    for alias_id, canonical_id in CANONICAL_SOURCE_ALIASES.items():
        assert alias_id != canonical_id
        assert english[alias_id]["name"] != english[canonical_id]["name"]
        assert spanish[alias_id]["name"] == spanish[canonical_id]["name"]

    skip_id = "dc59aedc-619a-4b9b-9806-6aae4d913496"
    leap_id = "274698d4-0a8e-47d6-8a85-d279729dc657"
    assert english[skip_id]["equipment"] != english[leap_id]["equipment"]
    assert SPANISH_NAME_OVERRIDES[skip_id] != SPANISH_NAME_OVERRIDES[leap_id]


def test_alias_source_drift_fails_closed() -> None:
    snapshot = deepcopy(load_vendored_snapshot())
    alias_id = next(iter(CANONICAL_SOURCE_ALIASES))
    record = next(item for item in snapshot.exercises["en"] if item["id"] == alias_id)
    record["forceType"] = "changed"
    with pytest.raises(ValueError, match="differs on forceType"):
        validate_catalogue_curation(snapshot.exercises)


def test_source_missing_a_reviewed_alias_fails_closed() -> None:
    snapshot = deepcopy(load_vendored_snapshot())
    alias_id = next(iter(CANONICAL_SOURCE_ALIASES))
    for locale in ("en", "es"):
        snapshot.exercises[locale] = [
            row for row in snapshot.exercises[locale] if row["id"] != alias_id
        ]
    with pytest.raises(ValueError, match="source alias is missing"):
        validate_catalogue_curation(snapshot.exercises)
