"""Generic CRUD helpers that encapsulate the DB-first / in-memory-fallback pattern."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from app.common.ownership import apply_ownership_filter
from app.common.schemas import ResponseEnvelope, ok
from app.common.timestamps import utc_now_iso
from app.config import get_supabase, safe_execute

if TYPE_CHECKING:
    from app.middleware.auth import CurrentUser

logger = logging.getLogger(__name__)


def soft_delete_with_fallback(
    table: str,
    record_id: str,
    user: CurrentUser,
    mem_store: list[dict],
    *,
    entity_name: str = "Record",
) -> ResponseEnvelope:
    """Soft-delete a row (set ``deleted_at``) with ownership scoping.

    Tries DB first, falls back to updating the in-memory *mem_store*.
    """
    is_dispatcher = user.role == "dispatcher_admin"
    now_iso = utc_now_iso()
    sb = get_supabase()

    try:
        query = sb.table(table).update({"deleted_at": now_iso}).eq("id", record_id)
        query = apply_ownership_filter(query, user, is_dispatcher=is_dispatcher)
        result = query.execute()
        if result.data:
            for row in mem_store:
                if row.get("id") == record_id:
                    row["deleted_at"] = now_iso
            return ok({"deleted": True})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("DB soft-delete on %s failed: %s", table, exc)

    # Fallback: in-memory
    for row in mem_store:
        if row.get("id") != record_id:
            continue
        if is_dispatcher and row.get("organization_id") == user.organization_id:
            row["deleted_at"] = now_iso
            return ok({"deleted": True})
        if user.carrier_id and row.get("carrier_id") == user.carrier_id:
            row["deleted_at"] = now_iso
            return ok({"deleted": True})

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{entity_name} not found",
    )


def update_with_fallback(
    table: str,
    record_id: str,
    updates: dict,
    user: CurrentUser,
    mem_store: list[dict],
    *,
    entity_name: str = "Record",
) -> ResponseEnvelope:
    """Update a row with ownership scoping, falling back to in-memory.

    ``updates`` must already contain ``updated_at``.
    """
    is_dispatcher = user.role == "dispatcher_admin"
    sb = get_supabase()

    try:
        query = sb.table(table).update(updates).eq("id", record_id)
        query = apply_ownership_filter(query, user, is_dispatcher=is_dispatcher)
        result = safe_execute(query)
        if result.data:
            for row in mem_store:
                if row.get("id") == record_id:
                    row.update(updates)
            return ok(result.data[0])
    except HTTPException:
        raise
    except Exception:
        pass

    # Fallback: in-memory
    for row in mem_store:
        if row.get("id") != record_id:
            continue
        if is_dispatcher and row.get("organization_id") == user.organization_id:
            row.update(updates)
            return ok(row)
        if user.carrier_id and row.get("carrier_id") == user.carrier_id:
            row.update(updates)
            return ok(row)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{entity_name} not found",
    )
