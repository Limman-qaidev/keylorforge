"""Minimal Free Workout session transitions with durable idempotent start."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from keylorforge_database.identity import (
    ApplicationUserRepository,
    TerminalIdentityError,
)
from keylorforge_database.models import (
    ApplicationUser,
    ApplicationUserLifecycle,
    AuthProvider,
    MachineMutationReceipt,
    WorkoutMutationReceipt,
    WorkoutSession,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.workouts.schemas import StartFreeWorkoutRequest, WorkoutSessionResponse


def _active_owner(
    session: Session, principal: AuthenticatedPrincipal, *, lock: bool
) -> ApplicationUser:
    try:
        owner = ApplicationUserRepository(session).get_or_provision_active_user(
            auth_provider=AuthProvider.SUPABASE,
            external_subject=principal.external_subject,
        )
    except TerminalIdentityError as exc:
        raise HTTPException(status_code=403, detail="not authorized") from exc
    if lock:
        # Serialize writes for one owner with M1's deletion preparation lock.
        locked = session.get(
            ApplicationUser, owner.id, with_for_update=True, populate_existing=True
        )
        if (
            locked is None
            or locked.lifecycle_state is not ApplicationUserLifecycle.ACTIVE
        ):
            raise HTTPException(status_code=403, detail="not authorized")
        return locked
    return owner


def _response(row: WorkoutSession) -> WorkoutSessionResponse:
    return WorkoutSessionResponse(
        id=row.id,
        origin=row.origin,
        lifecycle_state=row.lifecycle_state,
        started_at=row.started_at,
        time_zone=row.time_zone,
        utc_offset_minutes=row.utc_offset_minutes,
        local_date=row.local_date,
        agenda_revision=row.agenda_revision,
    )


def _intent_hash(request: StartFreeWorkoutRequest) -> str:
    # Stable across semantically identical timestamp timezone offsets.
    body = request.model_dump(mode="json")
    body["started_at"] = request.started_at.astimezone(UTC).isoformat()
    normalized = json.dumps(
        body, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def start_free_workout(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    request: StartFreeWorkoutRequest,
) -> WorkoutSessionResponse:
    """START_SESSION: one owner lock, one row, one immutable retry receipt."""

    owner = _active_owner(session, principal, lock=True)
    digest = _intent_hash(request)
    if session.get(MachineMutationReceipt, (request.mutation_id, owner.id)) is not None:
        raise HTTPException(409, detail="mutation ID already used for machine")
    receipt = session.get(WorkoutMutationReceipt, (request.mutation_id, owner.id))
    if receipt is not None:
        if receipt.intent_hash != digest or receipt.session_id != request.session_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="mutation ID reused for different intent",
            )
        return WorkoutSessionResponse.model_validate(receipt.response_payload)

    # A new mutation may not reinterpret an existing UUID or bypass the active
    # session invariant, even if another account owns the requested UUID.
    if session.get(WorkoutSession, request.session_id) is not None:
        raise HTTPException(status_code=409, detail="session ID already in use")
    existing = session.scalar(
        select(WorkoutSession.id).where(
            WorkoutSession.owner_user_id == owner.id,
            WorkoutSession.lifecycle_state == "active",
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="active workout already exists")

    instant = request.started_at.astimezone(UTC)
    local_start = instant.astimezone(ZoneInfo(request.time_zone))
    offset = local_start.utcoffset()
    if offset is None:
        raise HTTPException(status_code=422, detail="invalid start timezone")
    row = WorkoutSession(
        id=request.session_id,
        owner_user_id=owner.id,
        origin="free",
        lifecycle_state="active",
        started_at=instant,
        time_zone=request.time_zone,
        utc_offset_minutes=int(offset.total_seconds() // 60),
        local_date=local_start.date(),
        agenda_revision=0,
        start_prescription={"schema_version": 1, "origin": "free", "items": []},
    )
    session.add(row)
    session.flush()
    response = _response(row)
    session.add(
        WorkoutMutationReceipt(
            mutation_id=request.mutation_id,
            owner_user_id=owner.id,
            session_id=request.session_id,
            intent_hash=digest,
            response_payload=response.model_dump(mode="json"),
        )
    )
    session.flush()
    return response


def get_active_free_workout(
    *, session: Session, principal: AuthenticatedPrincipal
) -> WorkoutSessionResponse | None:
    """Fetch the caller's active session; never enumerate another owner's data."""

    # The lock is held through the request transaction, serializing against
    # account deletion so a stale token cannot read data after terminalization.
    owner = _active_owner(session, principal, lock=True)
    row = session.scalar(
        select(WorkoutSession).where(
            WorkoutSession.owner_user_id == owner.id,
            WorkoutSession.lifecycle_state == "active",
        )
    )
    return _response(row) if row is not None else None
