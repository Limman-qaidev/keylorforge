"""Shared SQLAlchemy metadata and application-identity models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
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
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False)
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
