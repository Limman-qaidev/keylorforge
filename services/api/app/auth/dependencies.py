"""FastAPI dependencies for protected caller-relative routes."""

from __future__ import annotations

from collections.abc import Generator
from os import environ
from typing import Annotated, cast

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from keylorforge_database.config import DatabaseSettings
from keylorforge_database.engine import create_session_factory
from sqlalchemy.orm import Session, sessionmaker

from app.auth.jwt_verifier import (
    AuthenticatedPrincipal,
    AuthenticationError,
    AuthorizationError,
    JwksCache,
    JwksProviderUnavailableError,
    SupabaseJwtVerifier,
)
from app.config import Settings

_bearer_scheme = HTTPBearer(auto_error=False)
BearerCredentials = Annotated[
    HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)
]


def get_jwt_verifier(request: Request) -> SupabaseJwtVerifier:
    """Get the configured verifier without allowing token-controlled discovery."""
    settings = cast(Settings, request.app.state.settings)
    try:
        issuer = settings.supabase_issuer()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="authentication is unavailable",
        ) from exc

    verifier = getattr(request.app.state, "jwt_verifier", None)
    if verifier is None:
        verifier = SupabaseJwtVerifier(
            issuer=issuer,
            jwks=JwksCache(
                settings.supabase_jwks_url(), settings.supabase_jwks_cache_seconds
            ),
        )
        request.app.state.jwt_verifier = verifier
    return cast(SupabaseJwtVerifier, verifier)


def get_authenticated_principal(
    request: Request,
    credentials: BearerCredentials,
) -> AuthenticatedPrincipal:
    """Fail closed unless a verified authenticated principal is present."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return get_jwt_verifier(request).verify(credentials.credentials)
    except JwksProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="authentication is temporarily unavailable",
        ) from exc
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except AuthorizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not authorized",
        ) from exc


def get_database_session(request: Request) -> Generator[Session, None, None]:
    """Yield a transaction-owning session for protected persistence operations."""
    session_factory = getattr(request.app.state, "session_factory", None)
    if session_factory is None:
        database_url = environ.get("KEYLORFORGE_DATABASE_URL")
        if database_url is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="identity storage is unavailable",
            )
        try:
            session_factory = create_session_factory(
                DatabaseSettings(database_url=database_url)
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="identity storage is unavailable",
            ) from exc
        request.app.state.session_factory = session_factory

    session = cast(sessionmaker[Session], session_factory)()
    try:
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()
