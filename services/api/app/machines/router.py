"""Protected, owner-relative M3 Machine Profile REST entry points."""

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
from app.machines.schemas import (
    CreateMachineConfigurationRequest,
    CreateMachineProfileRequest,
    MachineConfigurationResponse,
    MachineProfileResponse,
)
from app.machines.service import (
    create_machine_configuration,
    create_machine_profile,
    read_machine_configuration,
    read_machine_profile,
)

router = APIRouter(
    prefix="/machine-profiles",
    tags=["machines"],
    dependencies=[Depends(require_active_application_user)],
)


@router.post(
    "",
    response_model=MachineProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_profile(
    request: CreateMachineProfileRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> MachineProfileResponse:
    return create_machine_profile(session=session, principal=principal, request=request)


@router.get("/{profile_id}", response_model=MachineProfileResponse)
def get_profile(
    profile_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> MachineProfileResponse:
    return read_machine_profile(
        session=session, principal=principal, profile_id=profile_id
    )


@router.post(
    "/{profile_id}/configurations",
    response_model=MachineConfigurationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_configuration(
    profile_id: UUID,
    request: CreateMachineConfigurationRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> MachineConfigurationResponse:
    if request.profile_id != profile_id:
        raise HTTPException(status_code=422, detail="machine profile ID mismatch")
    return create_machine_configuration(
        session=session, principal=principal, request=request
    )


@router.get(
    "/{profile_id}/configurations/{configuration_id}",
    response_model=MachineConfigurationResponse,
)
def get_configuration(
    profile_id: UUID,
    configuration_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> MachineConfigurationResponse:
    return read_machine_configuration(
        session=session,
        principal=principal,
        profile_id=profile_id,
        configuration_id=configuration_id,
    )
