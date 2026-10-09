"""Protected owner-relative M3 Free Workout session endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    get_authenticated_principal,
    get_database_session,
    require_active_application_user,
)
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.schemas import StartFreeWorkoutRequest, WorkoutSessionResponse
from app.workouts.set_schemas import (
    ConfirmAdditionalSetRequest,
    ConfirmedSetResponse,
    ConfirmFirstSetRequest,
)
from app.workouts.set_service import confirm_performed_set
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


@router.post(
    "/{session_id}/sets/first",
    response_model=ConfirmedSetResponse,
    status_code=status.HTTP_201_CREATED,
)
def confirm_first_performed_set(
    session_id: UUID,
    request: ConfirmFirstSetRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> ConfirmedSetResponse:
    if request.session_id != session_id:
        raise HTTPException(status_code=422, detail="session ID mismatch")
    return confirm_performed_set(session=session, principal=principal, request=request)


@router.post(
    "/{session_id}/sets/additional",
    response_model=ConfirmedSetResponse,
    status_code=status.HTTP_201_CREATED,
)
def confirm_additional_performed_set(
    session_id: UUID,
    request: ConfirmAdditionalSetRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> ConfirmedSetResponse:
    if request.session_id != session_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="session ID mismatch")
    return confirm_performed_set(session=session, principal=principal, request=request)
