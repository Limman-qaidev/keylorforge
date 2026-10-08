"""Preserve upstream exercise rows while mapping reviewed semantic aliases.

Revision ID: 20261008_0001
Revises: 20260913_0001

Existing exercise primary keys are never rewritten or deleted. An alias keeps
its prior UUID and localized source names, while a single foreign key selects
the canonical application identity. The additive migration backfills already
imported M2 databases; the importer applies the same curation on fresh seeds.

The change is forward-only because a downgrade would silently lose accepted
canonicalization/provenance and could re-fragment future workout histories.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from keylorforge_database.catalog_curation import (
    CANONICAL_SOURCE_ALIASES,
    SPANISH_NAME_OVERRIDES,
)

revision: str = "20261008_0001"
down_revision: str | None = "20260913_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "catalog_exercises",
        sa.Column("canonical_exercise_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_catalog_exercises_canonical_exercise_id_catalog_exercises"),
        "catalog_exercises",
        "catalog_exercises",
        ["canonical_exercise_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_catalog_exercises_catalog_exercise_not_self_alias"),
        "catalog_exercises",
        "canonical_exercise_id IS NULL OR canonical_exercise_id <> id",
    )
    op.create_index(
        "ix_catalog_exercises_canonical_exercise_id",
        "catalog_exercises",
        ["canonical_exercise_id"],
    )

    bind = op.get_bind()
    for alias_source_id, canonical_source_id in sorted(CANONICAL_SOURCE_ALIASES.items()):
        bind.execute(
            sa.text(
                """
                UPDATE catalog_exercises AS alias
                SET canonical_exercise_id = canonical.id
                FROM catalog_exercises AS canonical
                WHERE alias.source = :source AND canonical.source = :source
                  AND alias.source_id = :alias_id
                  AND canonical.source_id = :canonical_id
                """
            ),
            {
                "source": "kinetic-place/exercises-db",
                "alias_id": alias_source_id,
                "canonical_id": canonical_source_id,
            },
        )

    for source_id, spanish_name in sorted(SPANISH_NAME_OVERRIDES.items()):
        bind.execute(
            sa.text(
                """
                UPDATE catalog_exercise_names AS localized
                SET name = :name
                FROM catalog_exercises AS exercise
                WHERE exercise.id = localized.exercise_id
                  AND exercise.source = :source
                  AND exercise.source_id = :source_id
                  AND localized.locale = 'es'
                """
            ),
            {
                "source": "kinetic-place/exercises-db",
                "source_id": source_id,
                "name": spanish_name,
            },
        )


def downgrade() -> None:
    raise NotImplementedError(
        "20261008_0001 preserves historical canonical exercise redirects; roll forward"
    )
