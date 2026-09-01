"""HTTP routes for caller-relative application identity."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_authenticated_principal, get_database_session
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.identity.schemas import (
    MeResponse,
    ProfileResponse,
    UpdateProfileRequest,
)
from app.identity.service import (
    get_or_provision_current_identity,
    update_current_profile,
)

router = APIRouter(tags=["identity"])


@router.get("/me", response_model=MeResponse)
def get_me(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> MeResponse:
    """Return only the authenticated caller's application identity foundation."""
    return get_or_provision_current_identity(principal=principal, session=session)


@router.patch("/me/profile", response_model=ProfileResponse)
def patch_my_profile(
    update: UpdateProfileRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    session: Annotated[Session, Depends(get_database_session)],
) -> ProfileResponse:
    """Update the authenticated caller's application-owned profile."""
    return update_current_profile(principal=principal, session=session, update=update)
