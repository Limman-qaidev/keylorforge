"""Shared SQLAlchemy metadata and application-identity models."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Date,
    Integer,
    Numeric,
    ForeignKeyConstraint,
    text,
    Enum,
    ForeignKey,
    Index,
    MetaData,
    Boolean,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB


NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def _enum_values(enum_type: type[StrEnum]) -> list[str]:
    """Persist StrEnum values instead of Python member names."""

    return [member.value for member in enum_type]


class Base(DeclarativeBase):
    """Base class for future domain models and Alembic autogeneration."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class AuthProvider(StrEnum):
    """External authentication providers supported by the application schema."""

    SUPABASE = "supabase"


class ApplicationUserLifecycle(StrEnum):
    """Persisted lifecycle states for an application-owned user identity."""

    ACTIVE = "active"
    DELETION_IN_PROGRESS = "deletion_in_progress"
    DELETED = "deleted"


class ExerciseMeasurementType(StrEnum):
    """Supported primary measurement for a canonical exercise."""

    REPS = "reps"
    TIME = "time"
    DISTANCE = "distance"


class ExerciseMuscleRole(StrEnum):
    """How a muscle participates in an exercise."""

    PRIMARY = "primary"
    SECONDARY = "secondary"
    TERTIARY = "tertiary"


class ApplicationUser(Base):
    """Application-owned identity with an explicit terminal deletion lifecycle."""

    __tablename__ = "application_users"
    __table_args__ = (
        CheckConstraint(
            "(lifecycle_state IN ('active', 'deletion_in_progress') AND deleted_at IS NULL) "
            "OR (lifecycle_state = 'deleted' AND deleted_at IS NOT NULL)",
            name="application_user_lifecycle_consistency",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    lifecycle_state: Mapped[ApplicationUserLifecycle] = mapped_column(
        Enum(
            ApplicationUserLifecycle,
            native_enum=False,
            length=32,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        default=ApplicationUserLifecycle.ACTIVE,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    identities: Mapped[list[ApplicationUserIdentity]] = relationship(
        back_populates="user", cascade="save-update, merge"
    )
    profile: Mapped[ApplicationUserProfile | None] = relationship(
        back_populates="user", cascade="save-update, merge", uselist=False
    )


class ApplicationUserIdentity(Base):
    """Immutable mapping from an external provider subject to an application user."""

    __tablename__ = "application_user_identities"
    __table_args__ = (
        CheckConstraint(
            "auth_provider = 'supabase'", name="application_user_identity_supported_provider"
        ),
        UniqueConstraint("auth_provider", "external_subject"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    auth_provider: Mapped[AuthProvider] = mapped_column(
        Enum(
            AuthProvider,
            native_enum=False,
            length=32,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        primary_key=True,
    )
    external_subject: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[ApplicationUser] = relationship(back_populates="identities")


class ApplicationUserProfile(Base):
    """One-to-one application-owned profile data without provider PII."""

    __tablename__ = "application_user_profiles"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    display_name: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped[ApplicationUser] = relationship(back_populates="profile")


class CatalogExercise(Base):
    """Application-owned canonical exercise imported from a traceable source."""

    __tablename__ = "catalog_exercises"
    __table_args__ = (
        UniqueConstraint("source", "source_id"),
        Index("ix_catalog_exercises_active_category", "is_active", "category"),
        Index("ix_catalog_exercises_canonical_exercise_id", "canonical_exercise_id"),
        CheckConstraint(
            "canonical_exercise_id IS NULL OR canonical_exercise_id <> id",
            name="catalog_exercise_not_self_alias",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False)
    canonical_exercise_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("catalog_exercises.id", ondelete="RESTRICT")
    )
    measurement_type: Mapped[ExerciseMeasurementType] = mapped_column(
        Enum(
            ExerciseMeasurementType,
            native_enum=False,
            length=16,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    difficulty_level: Mapped[str | None] = mapped_column(String(32))
    force_type: Mapped[str | None] = mapped_column(String(32))
    mechanics: Mapped[str | None] = mapped_column(String(32))
    category: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_curated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    canonical_exercise: Mapped[CatalogExercise | None] = relationship(
        "CatalogExercise", remote_side="CatalogExercise.id", back_populates="alias_records"
    )
    alias_records: Mapped[list[CatalogExercise]] = relationship(
        "CatalogExercise", back_populates="canonical_exercise"
    )
    names: Mapped[list[CatalogExerciseName]] = relationship(
        back_populates="exercise", cascade="save-update, merge"
    )
    muscles: Mapped[list[CatalogExerciseMuscle]] = relationship(
        back_populates="exercise", cascade="save-update, merge"
    )
    equipment: Mapped[list[CatalogExerciseEquipment]] = relationship(
        back_populates="exercise", cascade="save-update, merge"
    )


class CatalogExerciseName(Base):
    """A localized display name for a canonical exercise."""

    __tablename__ = "catalog_exercise_names"
    __table_args__ = (
        UniqueConstraint("exercise_id", "locale"),
        Index("ix_catalog_exercise_names_locale_name", "locale", "name"),
    )

    exercise_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("catalog_exercises.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    locale: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    exercise: Mapped[CatalogExercise] = relationship(back_populates="names")


class CatalogMuscle(Base):
    """Normalized muscle group with source provenance."""

    __tablename__ = "catalog_muscles"
    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_catalog_muscles_source_source_id"),
        UniqueConstraint("source", "slug", name="uq_catalog_muscles_source_slug"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)

    names: Mapped[list[CatalogMuscleName]] = relationship(
        back_populates="muscle", cascade="save-update, merge"
    )
    exercises: Mapped[list[CatalogExerciseMuscle]] = relationship(back_populates="muscle")


class CatalogMuscleName(Base):
    """A localized display name for a normalized muscle group."""

    __tablename__ = "catalog_muscle_names"
    __table_args__ = (UniqueConstraint("muscle_id", "locale"),)

    muscle_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("catalog_muscles.id", ondelete="RESTRICT"), primary_key=True
    )
    locale: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    muscle: Mapped[CatalogMuscle] = relationship(back_populates="names")


class CatalogEquipment(Base):
    """Normalized equipment with source provenance."""

    __tablename__ = "catalog_equipment"
    __table_args__ = (UniqueConstraint("source", "source_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False)
    equipment_type: Mapped[str | None] = mapped_column(String(32))
    usage_type: Mapped[str | None] = mapped_column(String(32))

    names: Mapped[list[CatalogEquipmentName]] = relationship(
        back_populates="equipment", cascade="save-update, merge"
    )
    exercises: Mapped[list[CatalogExerciseEquipment]] = relationship(back_populates="equipment")


class CatalogEquipmentName(Base):
    """A localized display name for a normalized equipment item."""

    __tablename__ = "catalog_equipment_names"
    __table_args__ = (UniqueConstraint("equipment_id", "locale"),)

    equipment_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("catalog_equipment.id", ondelete="RESTRICT"), primary_key=True
    )
    locale: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    equipment: Mapped[CatalogEquipment] = relationship(back_populates="names")


class CatalogExerciseMuscle(Base):
    """A role-bearing many-to-many association between exercise and muscle."""

    __tablename__ = "catalog_exercise_muscles"
    __table_args__ = (Index("ix_catalog_exercise_muscles_muscle_id", "muscle_id"),)

    exercise_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("catalog_exercises.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    muscle_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("catalog_muscles.id", ondelete="RESTRICT"), primary_key=True
    )
    role: Mapped[ExerciseMuscleRole] = mapped_column(
        Enum(
            ExerciseMuscleRole,
            native_enum=False,
            length=16,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )

    exercise: Mapped[CatalogExercise] = relationship(back_populates="muscles")
    muscle: Mapped[CatalogMuscle] = relationship(back_populates="exercises")


class CatalogExerciseEquipment(Base):
    """A many-to-many association between exercise and equipment."""

    __tablename__ = "catalog_exercise_equipment"
    __table_args__ = (Index("ix_catalog_exercise_equipment_equipment_id", "equipment_id"),)

    exercise_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("catalog_exercises.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    equipment_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("catalog_equipment.id", ondelete="RESTRICT"), primary_key=True
    )

    exercise: Mapped[CatalogExercise] = relationship(back_populates="equipment")
    equipment: Mapped[CatalogEquipment] = relationship(back_populates="exercises")



class WorkoutSession(Base):
    """Owner-scoped actual session, initially supporting Free Workout only.

    Starting or editing the agenda never creates performed exercise history.
    """

    __tablename__ = "workout_sessions"
    __table_args__ = (
        CheckConstraint("origin = 'free'", name="workout_session_supported_origin"),
        CheckConstraint(
            "lifecycle_state IN ('active', 'completed', 'cancelled')",
            name="workout_session_lifecycle",
        ),
        CheckConstraint(
            "utc_offset_minutes BETWEEN -840 AND 840",
            name="workout_session_utc_offset",
        ),
        CheckConstraint(
            "agenda_revision >= 0", name="workout_session_agenda_revision"
        ),
        UniqueConstraint("id", "owner_user_id", name="uq_workout_sessions_id_owner"),
        Index("ix_workout_sessions_owner_started", "owner_user_id", "started_at"),
        Index(
            "ix_workout_sessions_one_active_per_owner",
            "owner_user_id",
            unique=True,
            postgresql_where=text("lifecycle_state = 'active'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    owner_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    origin: Mapped[str] = mapped_column(String(16), nullable=False)
    lifecycle_state: Mapped[str] = mapped_column(String(16), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    time_zone: Mapped[str] = mapped_column(String(64), nullable=False)
    utc_offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_prescription: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    agenda_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WorkoutMutationReceipt(Base):
    """An authenticated owner's immutable acknowledgement of a semantic mutation."""

    __tablename__ = "workout_mutation_receipts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["session_id", "owner_user_id"],
            ["workout_sessions.id", "workout_sessions.owner_user_id"],
            ondelete="RESTRICT",
        ),
    )

    mutation_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    owner_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    session_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    intent_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WorkoutOccurrence(Base):
    """Actual performed exercise, created only together with its first set."""

    __tablename__ = "workout_occurrences"
    __table_args__ = (
        CheckConstraint("actual_order >= 0", name="actual_order"),
        ForeignKeyConstraint(
            ["session_id", "owner_user_id"],
            ["workout_sessions.id", "workout_sessions.owner_user_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["first_set_id", "id", "owner_user_id"],
            ["workout_sets.id", "workout_sets.occurrence_id",
             "workout_sets.owner_user_id"],
            name="fk_workout_occurrences_first_set",
            ondelete="NO ACTION",
            deferrable=True,
            initially="DEFERRED",
        ),
        UniqueConstraint(
            "id", "session_id", "owner_user_id",
            name="uq_workout_occurrences_identity_session_owner",
        ),
        UniqueConstraint(
            "owner_user_id", "first_set_id",
            name="uq_workout_occurrences_owner_first_set",
        ),
        Index("ix_workout_occurrences_owner_session", "owner_user_id", "session_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    owner_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    session_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    canonical_exercise_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("catalog_exercises.id", ondelete="RESTRICT"),
        nullable=False,
    )
    agenda_item_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    actual_order: Mapped[int] = mapped_column(Integer, nullable=False)
    first_set_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)


class WorkoutSet(Base):
    """Confirmed native measurement and immutable machine/target context."""

    __tablename__ = "workout_sets"
    __table_args__ = (
        CheckConstraint("set_role IN ('WARMUP', 'WORKING')", name="role"),
        CheckConstraint(
            "(measurement_type = 'reps' AND reps > 0 AND duration_seconds IS NULL "
            "AND distance_value IS NULL AND distance_unit IS NULL) OR "
            "(measurement_type = 'time' AND reps IS NULL AND duration_seconds > 0 "
            "AND distance_value IS NULL AND distance_unit IS NULL) OR "
            "(measurement_type = 'distance' AND reps IS NULL AND duration_seconds IS NULL "
            "AND distance_value > 0 AND distance_unit IN ('m', 'km', 'mi'))",
            name="measurement",
        ),
        CheckConstraint(
            "(load_value IS NULL AND load_unit IS NULL AND load_entry_semantics IS NULL) "
            "OR (load_value >= 0 AND load_unit IN ('kg', 'lb') AND "
            "load_entry_semantics IN ('total', 'per_implement', 'machine_display', 'assistance'))",
            name="load",
        ),
        CheckConstraint(
            "(machine_profile_id IS NOT NULL OR machine_configuration_id IS NULL)",
            name="configuration_needs_profile",
        ),
        ForeignKeyConstraint(
            ["occurrence_id", "session_id", "owner_user_id"],
            ["workout_occurrences.id", "workout_occurrences.session_id",
             "workout_occurrences.owner_user_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "owner_user_id", "mutation_id", name="uq_workout_sets_owner_mutation"
        ),
        UniqueConstraint(
            "id", "occurrence_id", "owner_user_id",
            name="uq_workout_sets_first_set_composite",
        ),
        Index(
            "ix_workout_sets_owner_occurrence_completed",
            "owner_user_id", "occurrence_id", "completed_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    owner_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    session_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    occurrence_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    mutation_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    set_role: Mapped[str] = mapped_column(String(16), nullable=False)
    measurement_type: Mapped[str] = mapped_column(String(16), nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    distance_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    distance_unit: Mapped[str | None] = mapped_column(String(4))
    load_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    load_unit: Mapped[str | None] = mapped_column(String(2))
    load_entry_semantics: Mapped[str | None] = mapped_column(String(24))
    # User-owned machine profiles are a later causal sync dependency.
    # Until the authoritative profile table/API exists, server requests
    # with machine_profile_id must fail closed rather than imply its sync.
    machine_profile_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    machine_configuration_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    machine_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    target_at_confirmation: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
