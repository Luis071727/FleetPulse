"""Shared helpers for resolving ownership (org_id / carrier_id) from the current user."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

if TYPE_CHECKING:
    from app.middleware.auth import CurrentUser

logger = logging.getLogger(__name__)


def resolve_owner(user: CurrentUser, carrier_id_override: str | None = None) -> tuple[str, str]:
    """Determine (org_id, carrier_id) based on the caller's role.

    ``carrier_id_override`` is the optional carrier_id supplied in a request
    payload (only meaningful for dispatchers).

    Returns ``(org_id, carrier_id)`` or raises an HTTPException.
    """
    is_dispatcher = user.role == "dispatcher_admin"

    if is_dispatcher and carrier_id_override:
        return user.organization_id, carrier_id_override

    if is_dispatcher and user.carrier_id:
        return user.organization_id, user.carrier_id

    if is_dispatcher:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="carrier_id required for dispatchers",
        )

    # Non-dispatcher (carrier) path
    if not user.carrier_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )
    return user.organization_id, user.carrier_id


def apply_ownership_filter(query, user: CurrentUser, *, is_dispatcher: bool | None = None):
    """Append org/carrier equality filters to a Supabase query builder.

    Returns the augmented query.  Raises ``HTTPException(403)`` when the
    caller has no identifiable scope.
    """
    if is_dispatcher is None:
        is_dispatcher = user.role == "dispatcher_admin"

    if is_dispatcher:
        return query.eq("organization_id", user.organization_id)

    if user.carrier_id:
        return query.eq("carrier_id", user.carrier_id)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized",
    )
