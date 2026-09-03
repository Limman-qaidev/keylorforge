"""HTTP routes for caller-relative application identity."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    get_authenticated_principal,
    get_database_session,
    get_supabase_admin_deletion_client,
)
from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.identity.schemas import (
    MeResponse,
    ProfileResponse,
    UpdateProfileRequest,
)
from app.identity.service import (
    delete_current_identity,
    get_or_provision_current_identity,
    update_current_profile,
)
from app.identity.supabase_admin import SupabaseAdminDeletionClient

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


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_authenticated_principal)],
    admin_client: Annotated[
        SupabaseAdminDeletionClient, Depends(get_supabase_admin_deletion_client)
    ],
    session: Annotated[Session, Depends(get_database_session)],
) -> Response:
    """Permanently delete the authenticated caller's account."""
    delete_current_identity(
        principal=principal, session=session, admin_client=admin_client
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
