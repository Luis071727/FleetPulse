import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.carriers.service import CarrierService
from app.common.schemas import ResponseEnvelope, ok
from app.config import get_supabase
from app.fmcsa.cache import FmcsaCacheService
from app.middleware.auth import CurrentUser, require_dispatcher, require_authenticated

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/carriers", tags=["carriers"])
service = CarrierService()
fmcsa_cache = FmcsaCacheService()


class CreateCarrierIn(BaseModel):
    dot_number: str
    notes: str | None = None


class UpdateCarrierIn(BaseModel):
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    notes: str | None = None
    portal_status: str | None = None
    status: str | None = None
    dba_name: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    address: str | None = None
    drivers: int | None = None
    power_units: int | None = None


class CreateCarrierManualIn(BaseModel):
    legal_name: str
    dot_number: str | None = None
    mc_number: str | None = None
    address: str | None = None
    phone: str | None = None
    power_units: int | None = None
    notes: str | None = None


@router.get("")
def list_carriers(
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    sort_by: str = Query(default="legal_name"),
    order: str = Query(default="asc"),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    org_id = user.organization_id
    if user.role != "dispatcher_admin" and user.carrier_id:
        # Carrier can only see their own data
        carrier = service.get_carrier(org_id, user.carrier_id)
        return ok([carrier] if carrier else [], total=1 if carrier else 0, limit=limit, offset=0)

    rows, total = service.list_carriers(
        org_id,
        search=search,
        status=status_filter,
        sort_by=sort_by,
        order=order,
        limit=limit,
        offset=offset,
    )
    return ok(rows, total=total, limit=limit, offset=offset)


@router.post("", status_code=201)
def create_carrier(
    payload: CreateCarrierIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    try:
        carrier = service.create_from_dot(user.organization_id, payload.dot_number, payload.notes)
        return ok(carrier)
    except ValueError as ex:
        msg = str(ex)
        if "already in roster" in msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=msg,
            ) from ex
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        ) from ex
    except LookupError as ex:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ex),
        ) from ex
    except RuntimeError as ex:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(ex),
        ) from ex


@router.post("/manual", status_code=201)
def create_carrier_manual(
    payload: CreateCarrierManualIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    try:
        carrier = service.create_manual(user.organization_id, payload.model_dump())
        return ok(carrier)
    except ValueError as ex:
        # ValueError carries the existing carrier ID for DOT duplicates
        existing_id = str(ex)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"DOT already in roster",
        ) from ex


@router.get("/lookup")
def lookup_carrier_dot(
    dot: str = Query(..., min_length=4, max_length=12),
    _user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    clean_dot = "".join(ch for ch in dot if ch.isdigit())
    if len(clean_dot) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="DOT must have at least 4 digits")

    result, cache_hit = fmcsa_cache.get_or_fetch_carrier(clean_dot)
    payload = {
        "dot_number": clean_dot,
        "found": result.found,
        "cached": cache_hit,
        "legal_name": result.data.get("legal_name") if result.data else None,
        "mc_number": result.data.get("mc_number") if result.data else None,
        "power_units": result.data.get("power_units") if result.data else None,
        "safety_rating": result.data.get("fmcsa_safety_rating") if result.data else None,
        "authority_status": result.data.get("authority_status") if result.data else None,
        "operating_status": result.data.get("operating_status") if result.data else None,
        "phone": result.data.get("phone") if result.data else None,
        "email": result.data.get("email") if result.data else None,
        "owner_name": result.data.get("owner_name") if result.data else None,
        "physical_address": result.data.get("physical_address") if result.data else None,
    }
    return ok(payload)


@router.get("/{carrier_id}")
def get_carrier(
    carrier_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    carrier = service.get_carrier(user.organization_id, carrier_id)
    if not carrier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carrier not found")
    return ok(carrier)


@router.patch("/{carrier_id}")
def update_carrier(
    carrier_id: str,
    payload: UpdateCarrierIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    carrier = service.update_carrier(user.organization_id, carrier_id, updates)
    if not carrier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carrier not found")
    return ok(carrier)


# ── Compliance Documents ──

@router.get("/{carrier_id}/compliance-documents")
def list_compliance_documents(
    carrier_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    carrier = service.get_carrier(user.organization_id, carrier_id)
    if not carrier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carrier not found")
    if user.role != "dispatcher_admin" and user.carrier_id != carrier_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Carrier access denied")
    try:
        sb = get_supabase()
        result = (
            sb.table("compliance_documents")
            .select("*")
            .eq("carrier_id", carrier_id)
            .order("expires_at", desc=False)
            .execute()
        )
        return ok(result.data or [])
    except Exception:
        return ok([])


# ── Pending Actions ──

@router.get("/{carrier_id}/pending-actions")
def list_pending_actions(
    carrier_id: str,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    try:
        sb = get_supabase()
        loads_result = (
            sb.table("loads")
            .select("*")
            .eq("carrier_id", carrier_id)
            .eq("organization_id", user.organization_id)
            .neq("status", "delivered")
            .is_("deleted_at", "null")
            .execute()
        )
        loads = loads_result.data or []

        enriched = []
        for load in loads:
            try:
                dr_result = (
                    sb.table("document_requests")
                    .select("id", count="exact")
                    .eq("load_id", load["id"])
                    .eq("status", "pending")
                    .execute()
                )
                count = dr_result.count if dr_result.count is not None else len(dr_result.data or [])
                if count > 0:
                    enriched.append({**load, "pending_requests_count": count})
            except Exception:
                pass

        return ok(enriched)
    except Exception:
        logger.debug("list_pending_actions failed for carrier %s", carrier_id)
        return ok([])
