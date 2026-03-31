import logging
from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.brokers.service import BrokerService
from app.common.schemas import ResponseEnvelope, ok
from app.config import get_supabase, safe_execute
from app.middleware.auth import CurrentUser, require_dispatcher, require_authenticated

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/loads", tags=["loads"])
broker_service = BrokerService()

# In-memory load store — used when Supabase RLS blocks table access
_LOADS: list[dict] = []
# In-memory invoice store — companion for auto-created invoices
_INVOICES: list[dict] = []
# In-memory message store — fallback when messages table is blocked/unavailable
_MESSAGES: list[dict] = []


class CreateLoadIn(BaseModel):
    carrier_id: str
    broker_mc: str
    broker_name: str | None = None
    route: str | None = None
    origin: str | None = None
    destination: str | None = None
    miles: float
    rate: float
    driver_pay: float
    fuel_cost: float = 0
    tolls: float = 0
    pickup_date: str | None = None
    delivery_date: str | None = None
    rc_reference: str | None = None  # Rate confirmation # or PDF filename
    customer_ap_email: str | None = None  # AP email for invoice delivery


class UpdateLoadIn(BaseModel):
    status: str | None = None
    actual_delivery_at: str | None = None
    broker_name: str | None = None
    broker_mc: str | None = None
    route: str | None = None
    miles: float | None = None
    rate: float | None = None
    driver_pay: float | None = None
    fuel_cost: float | None = None
    tolls: float | None = None
    pickup_date: str | None = None
    delivery_date: str | None = None
    rc_reference: str | None = None
    customer_ap_email: str | None = None
    origin: str | None = None
    destination: str | None = None


def _compute_financials(rate: float, driver_pay: float, fuel_cost: float, tolls: float, miles: float):
    net_profit = rate - driver_pay - fuel_cost - tolls
    rpm = rate / miles if miles else 0
    net_rpm = net_profit / miles if miles else 0
    return round(net_profit, 2), round(rpm, 2), round(net_rpm, 2)


@router.post("", status_code=201)
def create_load(
    payload: CreateLoadIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    sb = get_supabase()
    org_id = user.organization_id

    # Look up or create broker
    broker = broker_service.get_or_create_by_mc(payload.broker_mc)
    net_profit, rpm, net_rpm = _compute_financials(
        payload.rate, payload.driver_pay, payload.fuel_cost, payload.tolls, payload.miles
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    load_id = str(uuid4())

    # Parse origin/destination from route or direct fields
    origin_raw = payload.origin or (payload.route.split("→")[0].strip() if payload.route and "→" in payload.route else "")
    dest_raw = payload.destination or (payload.route.split("→")[-1].strip() if payload.route and "→" in payload.route else "")

    # Split "City, ST" into city / state if possible
    def _split_city_state(val: str) -> tuple[str, str]:
        if "," in val:
            parts = [p.strip() for p in val.rsplit(",", 1)]
            return parts[0], parts[1][:2].upper() if len(parts) > 1 else ""
        return val, ""

    origin_city, origin_state = _split_city_state(origin_raw)
    dest_city, dest_state = _split_city_state(dest_raw)

    load_row = {
        "id": load_id,
        "organization_id": org_id,
        "carrier_id": payload.carrier_id,
        "broker_id": broker.get("id"),
        "route": payload.route,
        "origin": origin_raw,
        "destination": dest_raw,
        "origin_city": origin_city or None,
        "origin_state": origin_state or None,
        "destination_city": dest_city or None,
        "destination_state": dest_state or None,
        "load_rate": payload.rate,
        "miles": payload.miles,
        "fuel_cost": payload.fuel_cost,
        "driver_pay": payload.driver_pay,
        "tolls": payload.tolls,
        "net_profit": net_profit,
        "rpm": rpm,
        "net_rpm": net_rpm,
        "broker_name": payload.broker_name,
        "rc_reference": payload.rc_reference,
        "customer_ap_email": payload.customer_ap_email,
        "status": "logged",
        "pickup_date": payload.pickup_date or str(date.today()),
        "delivery_date": payload.delivery_date,
        "created_at": now_iso,
    }
    load_result = safe_execute(sb.table("loads").insert(load_row), fallback=[load_row])
    load = load_result.data[0] if load_result.data else load_row
    # Always keep in memory
    _LOADS.append(load)

    # Auto-create invoice (FR-016a)
    # Look up carrier name for the invoice
    carrier_name = "—"
    try:
        from app.carriers.service import _CARRIERS
        c = next((c for c in _CARRIERS if c.get("id") == payload.carrier_id), None)
        if c:
            carrier_name = c.get("legal_name", "—")
    except Exception:
        pass

    inv_id = str(uuid4())
    invoice_number = payload.rc_reference.strip() if payload.rc_reference and payload.rc_reference.strip() else inv_id[:8]
    invoice_row = {
        "id": inv_id,
        "organization_id": org_id,
        "load_id": load.get("id", load_id),
        "carrier_id": payload.carrier_id,
        "carrier_name": carrier_name,
        "broker_id": broker.get("id"),
        "amount": payload.rate,
        "status": "pending",
        "followups_sent": 0,
        "invoice_number": invoice_number,
        "issued_date": str(date.today()),
        "due_date": str(date.today()),
        "customer_ap_email": payload.customer_ap_email,
        "created_at": now_iso,
    }
    inv_result = safe_execute(sb.table("invoices").insert(invoice_row), fallback=[invoice_row])
    invoice = inv_result.data[0] if inv_result.data else invoice_row
    _INVOICES.append(invoice)

    return ok({
        "load": load,
        "invoice": invoice,
        "ai_analysis": None,  # Populated by separate /ai/load/analyze call
    })


@router.get("")
def list_loads(
    carrier_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    sort_by: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    try:
        sb = get_supabase()
        query = sb.table("loads").select("*", count="exact").eq("organization_id", user.organization_id).is_("deleted_at", "null")

        if user.role != "dispatcher_admin" and user.carrier_id:
            query = query.eq("carrier_id", user.carrier_id)
        elif carrier_id:
            query = query.eq("carrier_id", carrier_id)

        if status_filter:
            query = query.eq("status", status_filter)

        query = query.order(sort_by, desc=(order == "desc")).range(offset, offset + limit - 1)
        result = query.execute()
        total = result.count if result.count is not None else len(result.data)
        return ok(result.data or [], total=total, limit=limit, offset=offset)
    except Exception:
        logger.debug("DB list_loads failed, using in-memory store")
        rows = [ld for ld in _LOADS if ld.get("organization_id") == user.organization_id and not ld.get("deleted_at")]
        if user.role != "dispatcher_admin" and user.carrier_id:
            rows = [ld for ld in rows if ld.get("carrier_id") == user.carrier_id]
        elif carrier_id:
            rows = [ld for ld in rows if ld.get("carrier_id") == carrier_id]
        if status_filter:
            rows = [ld for ld in rows if ld.get("status") == status_filter]
        return ok(rows[offset:offset + limit], total=len(rows), limit=limit, offset=offset)


@router.get("/{load_id}")
def get_load(
    load_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    sb = get_supabase()
    result = (
        sb.table("loads")
        .select("*")
        .eq("id", load_id)
        .eq("organization_id", user.organization_id)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Load not found")
    return ok(result.data)


@router.patch("/{load_id}")
def update_load(
    load_id: str,
    payload: UpdateLoadIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    sb = get_supabase()
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    # Recompute financials if rate/cost fields changed
    if any(k in updates for k in ("rate", "driver_pay", "fuel_cost", "tolls", "miles")):
        # Need current values for unchanged fields
        current = next((ld for ld in _LOADS if ld.get("id") == load_id), None)
        if current:
            r = updates.get("rate", current.get("load_rate", current.get("rate", 0)))
            dp = updates.get("driver_pay", current.get("driver_pay", 0))
            fc = updates.get("fuel_cost", current.get("fuel_cost", 0))
            t = updates.get("tolls", current.get("tolls", 0))
            m = updates.get("miles", current.get("miles", 0))
            net_profit, rpm, net_rpm = _compute_financials(float(r), float(dp), float(fc), float(t), float(m))
            updates["net_profit"] = net_profit
            updates["rpm"] = rpm
            updates["net_rpm"] = net_rpm
    if "rate" in updates:
        updates["load_rate"] = updates.pop("rate")

    # Recompute route if origin/destination changed
    if "origin" in updates or "destination" in updates:
        current = next((ld for ld in _LOADS if ld.get("id") == load_id), None)
        o = updates.get("origin", current.get("origin", "") if current else "")
        d = updates.get("destination", current.get("destination", "") if current else "")
        updates["route"] = f"{o} \u2192 {d}"

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        result = safe_execute(
            sb.table("loads")
            .update(updates)
            .eq("id", load_id)
            .eq("organization_id", user.organization_id)
        )
        if result.data:
            # Also update in-memory
            for ld in _LOADS:
                if ld.get("id") == load_id:
                    ld.update(updates)
            return ok(result.data[0])
    except Exception:
        pass

    # Fallback: update in-memory
    for ld in _LOADS:
        if ld.get("id") == load_id and ld.get("organization_id") == user.organization_id:
            ld.update(updates)
            return ok(ld)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Load not found")


@router.delete("/{load_id}", status_code=200)
def delete_load(
    load_id: str,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    now_iso = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    try:
        result = (
            sb.table("loads")
            .update({"deleted_at": now_iso})
            .eq("id", load_id)
            .eq("organization_id", user.organization_id)
            .execute()
        )
        if result.data:
            # Also soft-delete associated invoices
            sb.table("invoices").update({"deleted_at": now_iso}).eq("load_id", load_id).eq("organization_id", user.organization_id).execute()
            for ld in _LOADS:
                if ld.get("id") == load_id:
                    ld["deleted_at"] = now_iso
            return ok({"deleted": True})
    except Exception as e:
        logger.error("DB delete_load failed: %s", e)

    # Fallback: mark in-memory
    for ld in _LOADS:
        if ld.get("id") == load_id and ld.get("organization_id") == user.organization_id:
            ld["deleted_at"] = now_iso
            return ok({"deleted": True})
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Load not found")


# ── Document Requests ──

VALID_DOC_TYPES = {"BOL", "POD", "RATE_CON", "INVOICE", "OTHER"}
VALID_DOC_REQUEST_STATUSES = {"approved", "rejected"}


class CreateDocRequestIn(BaseModel):
    doc_type: str
    notes: str | None = None


class UpdateDocRequestIn(BaseModel):
    status: str


def _get_load_scope(load_id: str, user: CurrentUser) -> dict:
    sb = get_supabase()
    query = (
        sb.table("loads")
        .select("id, carrier_id, organization_id")
        .eq("id", load_id)
        .eq("organization_id", user.organization_id)
        .is_("deleted_at", "null")
    )
    if user.role != "dispatcher_admin" and user.carrier_id:
        query = query.eq("carrier_id", user.carrier_id)

    result = query.maybe_single().execute()
    if not result or not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Load not found")
    return result.data


def _serialize_document_request(row: dict) -> dict:
    return {
        **row,
        "notes": row.get("label"),
    }


def _serialize_message(row: dict) -> dict:
    return {
        **row,
        "role": row.get("sender_role"),
    }


@router.get("/{load_id}/document-requests")
def list_document_requests(
    load_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    try:
        _get_load_scope(load_id, user)
        sb = get_supabase()
        result = (
            sb.table("document_requests")
            .select("*")
            .eq("load_id", load_id)
            .order("created_at", desc=False)
            .execute()
        )
        return ok([_serialize_document_request(row) for row in (result.data or [])])
    except Exception:
        return ok([])


@router.post("/{load_id}/document-requests", status_code=201)
def create_document_request(
    load_id: str,
    payload: CreateDocRequestIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    if payload.doc_type not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid doc_type. Must be one of: {', '.join(sorted(VALID_DOC_TYPES))}",
        )
    load_row = _get_load_scope(load_id, user)
    sb = get_supabase()
    row = {
        "id": str(uuid4()),
        "load_id": load_id,
        "doc_type": payload.doc_type,
        "label": payload.notes,
        "status": "pending",
        "carrier_id": load_row.get("carrier_id"),
    }
    result = safe_execute(sb.table("document_requests").insert(row), fallback=[row])
    payload_row = result.data[0] if result.data else row
    return ok(_serialize_document_request(payload_row))


@router.patch("/{load_id}/document-requests/{request_id}")
def update_document_request(
    load_id: str,
    request_id: str,
    payload: UpdateDocRequestIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    if payload.status not in VALID_DOC_REQUEST_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_DOC_REQUEST_STATUSES))}",
        )
    _get_load_scope(load_id, user)
    sb = get_supabase()
    try:
        result = safe_execute(
            sb.table("document_requests")
            .update({"status": payload.status})
            .eq("id", request_id)
            .eq("load_id", load_id)
        )
        if result.data:
            return ok(_serialize_document_request(result.data[0]))
    except Exception:
        pass
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document request not found")


@router.delete("/{load_id}/document-requests/{request_id}", status_code=200)
def delete_document_request(
    load_id: str,
    request_id: str,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    _get_load_scope(load_id, user)
    sb = get_supabase()
    try:
        sb.table("document_requests").delete().eq("id", request_id).eq("load_id", load_id).execute()
    except Exception:
        pass
    return ok({"deleted": True})


# ── Messages ──

class CreateMessageIn(BaseModel):
    body: str


@router.get("/{load_id}/messages")
def list_messages(
    load_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    try:
        _get_load_scope(load_id, user)
        sb = get_supabase()
        result = (
            sb.table("messages")
            .select("*")
            .eq("load_id", load_id)
            .order("created_at", desc=False)
            .execute()
        )
        rows = result.data or []
        # If DB returned nothing, also surface any in-memory messages (RLS fallback)
        if not rows:
            rows = sorted(
                [m for m in _MESSAGES if m.get("load_id") == load_id],
                key=lambda m: m.get("created_at", ""),
            )
        return ok([_serialize_message(row) for row in rows])
    except Exception:
        # DB unavailable — return in-memory messages for this load
        rows = sorted(
            [m for m in _MESSAGES if m.get("load_id") == load_id],
            key=lambda m: m.get("created_at", ""),
        )
        return ok([_serialize_message(row) for row in rows])


@router.post("/{load_id}/messages", status_code=201)
def create_message(
    load_id: str,
    payload: CreateMessageIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    _get_load_scope(load_id, user)
    sb = get_supabase()
    row = {
        "id": str(uuid4()),
        "load_id": load_id,
        "sender_id": user.user_id,
        "sender_role": "dispatcher",
        "body": payload.body,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = safe_execute(sb.table("messages").insert(row), fallback=[row])
    payload_row = result.data[0] if result.data else row
    # Always persist in memory — ensures GET works even when DB insert was blocked
    _MESSAGES.append(payload_row)
    return ok(_serialize_message(payload_row))
