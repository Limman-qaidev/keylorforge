"""Authenticated, read-only, test-only preflight for physical M3 transport QA.

The route is included exclusively by test FastAPI processes. A mobile QA
client must verify the *actual PostgreSQL connection*, not just /health or
an environment variable, before allowing any workout mutation.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.auth.dependencies import get_authenticated_principal, get_database_session
from app.auth.jwt_verifier import AuthenticatedPrincipal
from keylorforge_database.models import CatalogExercise

EXPECTED_DATABASE = "keylorforge_m3_e2e"
router = APIRouter(prefix="/_qa", tags=["m3-qa"])


class M3ReadyResponse(BaseModel):
    ready: Literal[True] = True
    database: Literal["keylorforge_m3_e2e"] = EXPECTED_DATABASE
    exercises: int


@router.get("/m3-ready", response_model=M3ReadyResponse)
def m3_ready(
    _principal: Annotated[
        AuthenticatedPrincipal, Depends(get_authenticated_principal)
    ],
    session: Annotated[Session, Depends(get_database_session)],
) -> M3ReadyResponse:
    actual_database = session.scalar(text("SELECT current_database()"))
    if actual_database != EXPECTED_DATABASE:
        raise HTTPException(status_code=409, detail="unsafe M3 QA database target")
    count = session.scalar(select(func.count()).select_from(CatalogExercise))
    if not isinstance(count, int) or count < 1:
        raise HTTPException(status_code=409, detail="M3 QA catalogue not initialized")
    return M3ReadyResponse(exercises=count)
