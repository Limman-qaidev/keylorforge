"""Protected owner-relative M3 Free Workout session endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import AwareDatetime
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    get_authenticated_principal,
    get_database_session,
    require_active_application_user,
)
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.cancel_schemas import (
    CancelFreeWorkoutRequest,
    CancelFreeWorkoutResponse,
)
from app.workouts.cancel_service import cancel_free_workout
from app.workouts.finish_schemas import (
    FinishFreeWorkoutRequest,
    FinishFreeWorkoutResponse,
)
from app.workouts.finish_service import finish_free_workout
from app.workouts.history_detail_service import (
    CompletedWorkoutDetail,
    get_completed_workout_detail,
)
from app.workouts.history_service import (
    CompletedWorkoutHistoryPage,
    list_authoritative_completed_workouts,
)
from app.workouts.note_service import (
    ExerciseNoteCommand,
    ExerciseNotePage,
    ExerciseNoteResponse,
    append_exercise_note,
    list_exercise_notes,
    list_session_exercise_notes,
)
from app.workouts.lifecycle_service import (
    WorkoutLifecycleStateResponse,
    get_authoritative_workout_lifecycle,
)
from app.workouts.schemas import StartFreeWorkoutRequest, WorkoutSessionResponse
from app.workouts.service import get_active_free_workout, start_free_workout
from app.workouts.set_schemas import (
    ConfirmAdditionalSetRequest,
    ConfirmedSetResponse,
    ConfirmFirstSetRequest,
)
from app.workouts.set_service import confirm_performed_set

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


@router.get("/history", response_model=CompletedWorkoutHistoryPage)
def completed_history(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    before_finished_at: Annotated[AwareDatetime | None, Query()] = None,
    before_session_id: Annotated[UUID | None, Query()] = None,
) -> CompletedWorkoutHistoryPage:
    return list_authoritative_completed_workouts(
        session=session,
        principal=principal,
        limit=limit,
        before_finished_at=before_finished_at,
        before_session_id=before_session_id,
    )


@router.get(
    "/{session_id}/lifecycle-state",
    response_model=WorkoutLifecycleStateResponse,
)
def workout_lifecycle_state(
    session_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> WorkoutLifecycleStateResponse:
    return get_authoritative_workout_lifecycle(
        session=session, principal=principal, session_id=session_id
    )


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
        raise HTTPException(status_code=422, detail="session ID mismatch")
    return confirm_performed_set(session=session, principal=principal, request=request)


@router.post(
    "/{session_id}/finish",
    response_model=FinishFreeWorkoutResponse,
    status_code=status.HTTP_201_CREATED,
)
def finish_session(
    session_id: UUID,
    request: FinishFreeWorkoutRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> FinishFreeWorkoutResponse:
    if request.session_id != session_id:
        raise HTTPException(status_code=422, detail="session ID mismatch")
    return finish_free_workout(session=session, principal=principal, request=request)


@router.post(
    "/{session_id}/cancel",
    response_model=CancelFreeWorkoutResponse,
    status_code=status.HTTP_201_CREATED,
)
def cancel_session(
    session_id: UUID,
    request: CancelFreeWorkoutRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> CancelFreeWorkoutResponse:
    if request.session_id != session_id:
        raise HTTPException(status_code=422, detail="session ID mismatch")
    return cancel_free_workout(session=session, principal=principal, request=request)


@router.get(
    "/{session_id}/history-detail",
    response_model=CompletedWorkoutDetail,
)
def completed_workout_detail(
    session_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> CompletedWorkoutDetail:
    return get_completed_workout_detail(
        session=session, principal=principal, session_id=session_id
    )


@router.post(
    "/{session_id}/notes",
    response_model=ExerciseNoteResponse,
    status_code=status.HTTP_201_CREATED,
)
def append_session_exercise_note(
    session_id: UUID,
    request: ExerciseNoteCommand,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> ExerciseNoteResponse:
    if request.session_id != session_id:
        raise HTTPException(422, detail="session ID mismatch")
    return append_exercise_note(
        session=session, principal=principal, command=request
    )


@router.get("/{session_id}/notes", response_model=ExerciseNotePage)
def workout_session_notes(
    session_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> ExerciseNotePage:
    return list_session_exercise_notes(
        session=session, principal=principal,
        session_id=session_id, limit=limit,
    )


@router.get("/exercise-notes/{canonical_exercise_id}", response_model=ExerciseNotePage)
def exercise_note_history(
    canonical_exercise_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> ExerciseNotePage:
    return list_exercise_notes(
        session=session, principal=principal,
        canonical_exercise_id=canonical_exercise_id, limit=limit,
    )
