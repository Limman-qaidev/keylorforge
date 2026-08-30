"""Unit tests for fail-closed Supabase JWT verification."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.auth.jwt_verifier import (
    AuthenticationError,
    AuthorizationError,
    JwksCache,
    SupabaseJwtVerifier,
)

ISSUER = "https://example.supabase.co/auth/v1"


def _jwks(private_key: ec.EllipticCurvePrivateKey, key_id: str) -> dict[str, object]:
    key = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    key.update({"alg": "ES256", "kid": key_id, "use": "sig"})
    return {"keys": [key]}


def _token(
    private_key: ec.EllipticCurvePrivateKey,
    *,
    key_id: str,
    subject: str | None = None,
    issuer: str = ISSUER,
    audience: str = "authenticated",
    role: str = "authenticated",
    expiration: datetime | None = None,
) -> str:
    return jwt.encode(
        {
            "aud": audience,
            "exp": expiration or datetime.now(UTC) + timedelta(minutes=5),
            "iss": issuer,
            "role": role,
            "sub": subject or str(uuid4()),
        },
        private_key,
        algorithm="ES256",
        headers={"kid": key_id},
    )


def _verifier(jwks: dict[str, object]) -> SupabaseJwtVerifier:
    return SupabaseJwtVerifier(
        issuer=ISSUER,
        jwks=JwksCache("https://example.invalid/jwks", 300, fetcher=lambda _: jwks),
    )


def test_verifies_authenticated_es256_token() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    subject = uuid4()

    principal = _verifier(_jwks(private_key, "active-key")).verify(
        _token(private_key, key_id="active-key", subject=str(subject))
    )

    assert principal.external_subject == subject


@pytest.mark.parametrize(
    ("token_kwargs", "exception"),
    [
        ({"expiration": datetime.now(UTC) - timedelta(seconds=1)}, AuthenticationError),
        ({"issuer": "https://other.supabase.co/auth/v1"}, AuthenticationError),
        ({"audience": "anon"}, AuthenticationError),
        ({"role": "anon"}, AuthorizationError),
        ({"subject": "not-a-uuid"}, AuthenticationError),
    ],
)
def test_rejects_invalid_claims(
    token_kwargs: dict[str, object], exception: type[Exception]
) -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    verifier = _verifier(_jwks(private_key, "active-key"))

    with pytest.raises(exception):
        verifier.verify(_token(private_key, key_id="active-key", **token_kwargs))


def test_refreshes_jwks_when_unknown_key_id_appears() -> None:
    old_key = ec.generate_private_key(ec.SECP256R1())
    new_key = ec.generate_private_key(ec.SECP256R1())
    responses = iter((_jwks(old_key, "old"), _jwks(new_key, "new")))
    fetch_count = 0

    def fetcher(_: str) -> dict[str, object]:
        nonlocal fetch_count
        fetch_count += 1
        return next(responses)

    verifier = SupabaseJwtVerifier(
        issuer=ISSUER,
        jwks=JwksCache("https://example.invalid/jwks", 300, fetcher=fetcher),
    )

    verifier.verify(_token(new_key, key_id="new"))

    assert fetch_count == 2


def test_refreshes_jwks_when_a_key_rotates_with_the_same_id() -> None:
    old_key = ec.generate_private_key(ec.SECP256R1())
    rotated_key = ec.generate_private_key(ec.SECP256R1())
    responses = iter((_jwks(old_key, "stable-id"), _jwks(rotated_key, "stable-id")))
    verifier = SupabaseJwtVerifier(
        issuer=ISSUER,
        jwks=JwksCache(
            "https://example.invalid/jwks", 300, fetcher=lambda _: next(responses)
        ),
    )

    verifier.verify(_token(rotated_key, key_id="stable-id"))
