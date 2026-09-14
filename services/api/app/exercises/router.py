"""Authenticated HTTP routes for the read-only exercise catalogue."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_authenticated_principal, get_database_session
from app.exercises.schemas import CatalogueReference, ExerciseDetail, ExercisePage
from app.exercises.service import (
    get_exercise,
    list_equipment,
    list_exercises,
    list_muscles,
)

Locale = Literal["es", "en"]
router = APIRouter(
    tags=["exercises"], dependencies=[Depends(get_authenticated_principal)]
)


@router.get("/exercises", response_model=ExercisePage)
def get_exercises(
    session: Annotated[Session, Depends(get_database_session)],
    locale: Annotated[Locale, Query()] = "es",
    search: Annotated[str | None, Query()] = None,
    primary_muscle_id: Annotated[UUID | None, Query()] = None,
    equipment_id: Annotated[UUID | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ExercisePage:
    """List visible system exercises with localized deterministic filtering."""
    return list_exercises(
        session=session,
        locale=locale,
        search=search,
        primary_muscle_id=primary_muscle_id,
        equipment_id=equipment_id,
        page=page,
        page_size=page_size,
    )


@router.get("/exercises/{exercise_id}", response_model=ExerciseDetail)
def get_exercise_detail(
    exercise_id: UUID,
    session: Annotated[Session, Depends(get_database_session)],
    locale: Annotated[Locale, Query()] = "es",
) -> ExerciseDetail:
    """Return one visible localized system exercise."""
    return get_exercise(session=session, exercise_id=exercise_id, locale=locale)


@router.get("/muscles", response_model=list[CatalogueReference])
def get_muscles(
    session: Annotated[Session, Depends(get_database_session)],
    locale: Annotated[Locale, Query()] = "es",
) -> list[CatalogueReference]:
    """List localized muscle references."""
    return list_muscles(session=session, locale=locale)


@router.get("/equipment", response_model=list[CatalogueReference])
def get_equipment(
    session: Annotated[Session, Depends(get_database_session)],
    locale: Annotated[Locale, Query()] = "es",
) -> list[CatalogueReference]:
    """List localized equipment references."""
    return list_equipment(session=session, locale=locale)
