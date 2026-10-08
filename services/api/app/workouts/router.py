"""Protected owner-relative M3 Free Workout session endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    get_authenticated_principal,
    get_database_session,
    require_active_application_user,
)
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.schemas import StartFreeWorkoutRequest, WorkoutSessionResponse
from app.workouts.service import get_active_free_workout, start_free_workout

router = APIRouter(
    prefix="/workout-sessions",
    tags=["workouts"],
    dependencies=[Depends(require_active_application_user)],
)


@router.post(
    "/start",
    response_model=WorkoutSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_free_session(
    request: StartFreeWorkoutRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> WorkoutSessionResponse:
    return start_free_workout(session=session, principal=principal, request=request)


@router.get("/active", response_model=WorkoutSessionResponse | None)
def active_session(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> WorkoutSessionResponse | None:
    return get_active_free_workout(session=session, principal=principal)
