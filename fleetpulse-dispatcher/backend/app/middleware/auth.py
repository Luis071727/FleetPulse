import logging
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt, jwk

from app.config import get_supabase, settings

logger = logging.getLogger(__name__)

# Cache of user lookups to avoid repeated DB hits per request
_user_cache: dict[str, dict] = {}

# Cached JWKS keys for ES256 verification
_jwks_cache: dict | None = None


@dataclass
class CurrentUser:
    user_id: str
    organization_id: str | None
    carrier_id: str | None
    role: str


def _get_jwks() -> dict:
    """Fetch and cache the Supabase JWKS (ES256 public keys)."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    return _jwks_cache


def _decode_supabase_jwt(token: str) -> dict:
    """Decode a Supabase-issued JWT (supports both HS256 and ES256)."""
    # Peek at the header to determine algorithm
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        logger.warning("JWT header unreadable: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    alg = header.get("alg", "HS256")

    try:
        if alg == "ES256":
            jwks = _get_jwks()
            kid = header.get("kid")
            # Find the matching key
            key_data = None
            for k in jwks.get("keys", []):
                if k.get("kid") == kid or kid is None:
                    key_data = k
                    break
            if not key_data:
                raise JWTError("No matching JWK found for kid=%s" % kid)
            public_key = jwk.construct(key_data, algorithm="ES256")
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )
        else:
            # Fallback to HS256 with shared secret
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        return payload
    except JWTError as exc:
        logger.warning("JWT decode failed: %s | token prefix: %s...", exc, token[:20])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def _resolve_user_from_sub(sub: str) -> CurrentUser:
    """Look up our app user row by the Supabase Auth uid (sub claim)."""
    # Check cache first
    if sub in _user_cache:
        u = _user_cache[sub]
        return CurrentUser(
            user_id=u["id"],
            organization_id=u.get("organization_id"),
            carrier_id=u.get("carrier_id"),
            role=u.get("role", "carrier_free"),
        )

    sb = get_supabase()
    result = sb.table("users").select("*").eq("id", sub).maybe_single().execute()
    user = result.data if result else None

    if not user:
        logger.warning("Auth: user row not found for sub=%s", sub)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    _user_cache[sub] = user
    return CurrentUser(
        user_id=user["id"],
        organization_id=user.get("organization_id"),
        carrier_id=user.get("carrier_id"),
        role=user.get("role", "carrier_free"),
    )


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        logger.warning("Auth: missing bearer token, header='%s'", authorization[:30] if authorization else '(empty)')
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    token = authorization.removeprefix("Bearer ").strip()

    # Decode the Supabase JWT
    payload = _decode_supabase_jwt(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")

    return _resolve_user_from_sub(sub)


def require_dispatcher(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "dispatcher_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="dispatcher_admin role required",
        )
    return user


def require_authenticated(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user
