"""Unit tests for fail-closed Supabase JWT verification."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from threading import Event, Thread
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.auth.jwt_verifier import (
    AuthenticationError,
    AuthorizationError,
    JwksCache,
    JwksProviderUnavailableError,
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

    verifier.verify(_token(old_key, key_id="old"))
    verifier.verify(_token(new_key, key_id="new"))

    assert fetch_count == 2


def test_bounds_unknown_key_refreshes_for_a_cache_generation() -> None:
    trusted_key = ec.generate_private_key(ec.SECP256R1())
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    fetch_count = 0

    def fetcher(_: str) -> dict[str, object]:
        nonlocal fetch_count
        fetch_count += 1
        return _jwks(trusted_key, "trusted")

    verifier = SupabaseJwtVerifier(
        issuer=ISSUER,
        jwks=JwksCache("https://example.invalid/jwks", 300, fetcher=fetcher),
    )
    verifier.verify(_token(trusted_key, key_id="trusted"))

    for key_id in ("forged-one", "forged-two", "forged-one"):
        with pytest.raises(AuthenticationError):
            verifier.verify(_token(attacker_key, key_id=key_id))

    assert fetch_count == 2


def test_bounds_a_cold_unknown_key_to_one_provider_fetch() -> None:
    trusted_key = ec.generate_private_key(ec.SECP256R1())
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    fetch_count = 0

    def fetcher(_: str) -> dict[str, object]:
        nonlocal fetch_count
        fetch_count += 1
        return _jwks(trusted_key, "trusted")

    verifier = SupabaseJwtVerifier(
        issuer=ISSUER,
        jwks=JwksCache("https://example.invalid/jwks", 300, fetcher=fetcher),
    )

    with pytest.raises(AuthenticationError):
        verifier.verify(_token(attacker_key, key_id="forged"))

    assert fetch_count == 1


def test_keeps_cached_keys_available_while_an_unknown_key_refreshes() -> None:
    trusted_key = ec.generate_private_key(ec.SECP256R1())
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    refresh_started = Event()
    allow_refresh = Event()
    fetch_count = 0

    def fetcher(_: str) -> dict[str, object]:
        nonlocal fetch_count
        fetch_count += 1
        if fetch_count == 2:
            refresh_started.set()
            assert allow_refresh.wait(timeout=1)
        return _jwks(trusted_key, "trusted")

    cache = JwksCache("https://example.invalid/jwks", 300, fetcher=fetcher)
    verifier = SupabaseJwtVerifier(issuer=ISSUER, jwks=cache)
    verifier.verify(_token(trusted_key, key_id="trusted"))

    worker = Thread(
        target=lambda: _verify_unknown_key(verifier, attacker_key), daemon=True
    )
    worker.start()
    assert refresh_started.wait(timeout=1)

    assert cache.get_key("trusted") is not None

    allow_refresh.set()
    worker.join(timeout=1)
    assert not worker.is_alive()


def _verify_unknown_key(
    verifier: SupabaseJwtVerifier, attacker_key: ec.EllipticCurvePrivateKey
) -> None:
    with pytest.raises(AuthenticationError):
        verifier.verify(_token(attacker_key, key_id="forged"))


def test_provider_outage_is_distinct_from_invalid_credentials() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())

    def unavailable_fetcher(_: str) -> dict[str, object]:
        raise TimeoutError("provider timed out")

    verifier = SupabaseJwtVerifier(
        issuer=ISSUER,
        jwks=JwksCache(
            "https://example.invalid/jwks", 300, fetcher=unavailable_fetcher
        ),
    )

    with pytest.raises(JwksProviderUnavailableError):
        verifier.verify(_token(private_key, key_id="trusted"))


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


def test_rejects_bad_signature_without_repeated_jwks_refreshes() -> None:
    trusted_key = ec.generate_private_key(ec.SECP256R1())
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    fetch_count = 0

    def fetcher(_: str) -> dict[str, object]:
        nonlocal fetch_count
        fetch_count += 1
        return _jwks(trusted_key, "stable-id")

    verifier = SupabaseJwtVerifier(
        issuer=ISSUER,
        jwks=JwksCache("https://example.invalid/jwks", 300, fetcher=fetcher),
    )
    invalid_token = _token(attacker_key, key_id="stable-id")

    with pytest.raises(AuthenticationError):
        verifier.verify(invalid_token)
    with pytest.raises(AuthenticationError):
        verifier.verify(invalid_token)

    assert fetch_count == 2
