import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.common.schemas import ResponseEnvelope, ok
from app.config import get_supabase, safe_execute
from app.middleware.auth import CurrentUser, require_dispatcher, require_authenticated

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _get_invoices_mem() -> list[dict]:
    """Import the in-memory invoice store from loads.routes (created alongside loads)."""
    try:
        from app.loads.routes import _INVOICES
        return _INVOICES
    except ImportError:
        return []


def _get_loads_mem() -> list[dict]:
    try:
        from app.loads.routes import _LOADS
        return _LOADS
    except ImportError:
        return []


def _get_carriers_mem() -> list[dict]:
    try:
        from app.carriers.service import _CARRIERS
        return _CARRIERS
    except ImportError:
        return []


def _normalize_invoice_number(value: str | None, fallback: str) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return stripped
    return fallback


def _parse_date_value(value: str | None) -> date | None:
    if not value:
        return None
    raw = str(value)
    try:
        return datetime.fromisoformat(raw).date() if "T" in raw else date.fromisoformat(raw)
    except (TypeError, ValueError):
        return None


def _compute_days_outstanding(invoice: dict, load: dict | None = None) -> int:
    base_date = None
    if load:
        base_date = _parse_date_value(load.get("actual_delivery_at")) or _parse_date_value(load.get("delivery_date"))
    if base_date is None:
        base_date = _parse_date_value(invoice.get("issued_date"))
    if base_date is None:
        existing_days = invoice.get("days_outstanding")
        if isinstance(existing_days, (int, float)):
            return max(int(existing_days), 0)
        return 0
    return max((date.today() - base_date).days, 0)


def _get_loads_lookup(org_id: str, sb=None) -> dict[str, dict]:
    loads = {ld.get("id"): ld for ld in _get_loads_mem() if ld.get("organization_id") == org_id}
    if sb is None:
        return loads
    try:
        result = (
            sb.table("loads")
            .select("id, broker_name, customer_ap_email, actual_delivery_at, delivery_date, rc_reference")
            .eq("organization_id", org_id)
            .is_("deleted_at", "null")
            .execute()
        )
        for load in result.data or []:
            loads[load.get("id")] = load
    except Exception:
        logger.debug("DB load lookup failed, using in-memory loads only")
    return loads


def _get_carriers_lookup(org_id: str, sb=None) -> dict[str, dict]:
    carriers = {c.get("id"): c for c in _get_carriers_mem() if c.get("organization_id") == org_id}
    if sb is None:
        return carriers
    try:
        result = (
            sb.table("carriers")
            .select("id, legal_name")
            .eq("organization_id", org_id)
            .is_("deleted_at", "null")
            .execute()
        )
        for carrier in result.data or []:
            carriers[carrier.get("id")] = carrier
    except Exception:
        logger.debug("DB carrier lookup failed, using in-memory carriers only")
    return carriers


_COLLECTION_ACTIONS = {
    "not_sent": "Send invoice",
    "waiting": "Wait or gentle follow-up",
    "follow_up": "Send follow-up",
    "urgent": "Escalate follow-up",
}
_COLLECTION_PRIORITIES = {"urgent": "high", "follow_up": "medium", "waiting": "low", "not_sent": "low"}
_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _add_collection_fields(inv: dict) -> None:
    """Compute and attach collection_status, recommended_action, priority, next_action_at."""
    status = inv.get("status", "pending")
    days = int(inv.get("days_outstanding", 0) or 0)

    if status == "pending":
        cs = "not_sent"
    elif status == "sent" and days < 7:
        cs = "waiting"
    elif days >= 30 or status == "overdue":
        cs = "urgent"
    elif days >= 7:
        cs = "follow_up"
    else:
        cs = "waiting"

    inv["collection_status"] = cs
    inv["recommended_action"] = _COLLECTION_ACTIONS[cs]
    inv["priority"] = _COLLECTION_PRIORITIES[cs]

    if cs in ("follow_up", "urgent", "not_sent"):
        inv["next_action_at"] = datetime.now(timezone.utc).isoformat()
    else:
        base = _parse_date_value(inv.get("issued_date"))
        if base:
            next_at = datetime(base.year, base.month, base.day, tzinfo=timezone.utc) + timedelta(days=7)
            inv["next_action_at"] = next_at.isoformat()
        else:
            inv["next_action_at"] = None


def should_auto_followup(invoice: dict) -> bool:
    """Return True when an invoice qualifies for automated follow-up (hook — do not auto-send yet)."""
    return (
        invoice.get("status") == "sent"
        and int(invoice.get("days_outstanding", 0) or 0) >= 7
        and int(invoice.get("followups_sent", 0) or 0) < 3
    )


def _enrich_invoices(invoices: list[dict], org_id: str, sb=None) -> list[dict]:
    """Add carrier_name, invoice_number, delivery-based days_outstanding, and collection fields."""
    if not invoices:
        return invoices

    carriers = _get_carriers_lookup(org_id, sb=sb)
    loads = _get_loads_lookup(org_id, sb=sb)

    for inv in invoices:
        # Carrier name lookup
        carrier_id = inv.get("carrier_id")
        if carrier_id and carrier_id in carriers:
            inv["carrier_name"] = carriers[carrier_id].get("legal_name", "—")
        elif not inv.get("carrier_name"):
            inv["carrier_name"] = "—"

        load_id = inv.get("load_id")
        load = loads.get(load_id) if load_id else None
        inv["invoice_number"] = _normalize_invoice_number(
            inv.get("invoice_number") or (load.get("rc_reference") if load else None),
            str(inv.get("id", ""))[:8],
        )

        if load_id and load_id in loads:
            # Customer name = broker_name on the load
            if not inv.get("broker_name"):
                inv["broker_name"] = load.get("broker_name") or "—"
            # AP email from load
            if not inv.get("customer_ap_email"):
                inv["customer_ap_email"] = load.get("customer_ap_email") or ""

        if inv.get("status") not in ("paid",):
            inv["days_outstanding"] = _compute_days_outstanding(inv, load)

            # Auto-flag overdue when days > 30
            days = inv.get("days_outstanding", 0)
            if isinstance(days, (int, float)) and days > 30 and inv.get("status") in ("pending", "sent"):
                inv["status"] = "overdue"

            _add_collection_fields(inv)
        else:
            inv["days_outstanding"] = 0
            inv["collection_status"] = "collected"
            inv["recommended_action"] = "No action needed"
            inv["priority"] = "low"
            inv["next_action_at"] = None

    return invoices


class InvoiceStatusUpdate(BaseModel):
    status: str | None = None  # pending, sent, shortpaid, claim, overdue, paid
    paid_date: str | None = None
    carrier_id: str | None = None
    customer_ap_email: str | None = None
    amount: float | None = None
    notes: str | None = None
    issued_date: str | None = None
    due_date: str | None = None
    invoice_number: str | None = None


class CreateInvoiceIn(BaseModel):
    carrier_id: str | None = None
    broker_mc: str | None = None
    amount: float
    issued_date: str | None = None
    due_date: str | None = None
    load_id: str | None = None
    notes: str | None = None
    invoice_number: str | None = None
    customer_ap_email: str | None = None


@router.post("", status_code=201)
def create_invoice(
    payload: CreateInvoiceIn,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    from uuid import uuid4

    is_dispatcher = user.role == "dispatcher_admin"
    now_iso = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()

    # Resolve org_id and carrier_id
    if is_dispatcher and payload.carrier_id:
        org_id = user.organization_id
        carrier_id = payload.carrier_id
    elif is_dispatcher and user.carrier_id:
        # Dispatcher also linked to a carrier — treat as carrier
        org_id = user.organization_id
        carrier_id = user.carrier_id
    elif is_dispatcher:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="carrier_id required for dispatchers")
    else:
        if not user.carrier_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        carrier_id = user.carrier_id
        org_id = user.organization_id

    linked_load = _get_loads_lookup(org_id or "", sb=sb).get(payload.load_id) if payload.load_id and org_id else None

    # Look up broker if MC provided
    broker_id = None
    if payload.broker_mc:
        try:
            from app.brokers.service import BrokerService
            broker = BrokerService().get_or_create_by_mc(payload.broker_mc)
            broker_id = broker.get("id")
        except Exception:
            pass

    # Look up carrier name
    carrier_name = "—"
    try:
        carriers = _get_carriers_mem()
        c = next((c for c in carriers if c.get("id") == carrier_id), None)
        if c:
            carrier_name = c.get("legal_name", "—")
    except Exception:
        pass

    inv_id = str(uuid4())
    invoice_number = _normalize_invoice_number(
        payload.invoice_number or (linked_load.get("rc_reference") if linked_load else None),
        inv_id[:8],
    )
    invoice_row = {
        "id": inv_id,
        "organization_id": org_id,
        "load_id": payload.load_id,
        "carrier_id": carrier_id,
        "carrier_name": carrier_name,
        "broker_id": broker_id,
        "amount": payload.amount,
        "status": "pending",
        "followups_sent": 0,
        "invoice_number": invoice_number,
        "issued_date": payload.issued_date or str(date.today()),
        "due_date": payload.due_date or str(date.today()),
        "customer_ap_email": payload.customer_ap_email,
        "notes": payload.notes,
        "created_at": now_iso,
    }

    try:
        result = safe_execute(sb.table("invoices").insert(invoice_row), fallback=[invoice_row])
        invoice = result.data[0] if result.data else invoice_row
    except Exception:
        invoice = invoice_row

    # Store in memory
    _get_invoices_mem().append(invoice)

    return ok(invoice)


@router.get("")
def list_invoices(
    carrier_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    sort_by: str = Query(default="issued_date"),
    order: str = Query(default="desc"),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    try:
        sb = get_supabase()
        query = (
            sb.table("invoices")
            .select("*", count="exact")
            .eq("organization_id", user.organization_id)
            .is_("deleted_at", "null")
        )

        if user.role != "dispatcher_admin" and user.carrier_id:
            query = query.eq("carrier_id", user.carrier_id)
        elif carrier_id:
            query = query.eq("carrier_id", carrier_id)

        if status_filter:
            query = query.eq("status", status_filter)

        # days_outstanding is computed in-memory, not a DB column — map to issued_date
        db_sort = "issued_date" if sort_by == "days_outstanding" else sort_by
        query = query.order(db_sort, desc=(order == "desc")).range(offset, offset + limit - 1)
        result = query.execute()
        data = result.data or []
        total = result.count if result.count is not None else len(data)

        total_outstanding = sum(
            float(inv.get("amount", 0)) for inv in data if inv.get("status") != "paid"
        )

        # Enrich with carrier_name and compute days_outstanding
        data = _enrich_invoices(data, user.organization_id, sb=sb)

        return ok(data, total=total, total_outstanding=total_outstanding, limit=limit, offset=offset)
    except Exception:
        logger.debug("DB list_invoices failed, using in-memory store")
        invoices = _get_invoices_mem()
        rows = [iv for iv in invoices if iv.get("organization_id") == user.organization_id and not iv.get("deleted_at")]
        if user.role != "dispatcher_admin" and user.carrier_id:
            rows = [iv for iv in rows if iv.get("carrier_id") == user.carrier_id]
        elif carrier_id:
            rows = [iv for iv in rows if iv.get("carrier_id") == carrier_id]
        if status_filter:
            rows = [iv for iv in rows if iv.get("status") == status_filter]
        total_outstanding = sum(float(iv.get("amount", 0)) for iv in rows if iv.get("status") != "paid")
        result_rows = _enrich_invoices(rows[offset:offset + limit], user.organization_id)
        return ok(result_rows, total=len(rows), total_outstanding=total_outstanding, limit=limit, offset=offset)


@router.get("/collection-queue")
def collection_queue(
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    """Return sent/overdue invoices sorted by collection priority then days outstanding."""
    try:
        sb = get_supabase()
        query = (
            sb.table("invoices")
            .select("*", count="exact")
            .in_("status", ["sent", "overdue"])
            .is_("deleted_at", "null")
        )
        if user.organization_id:
            query = query.eq("organization_id", user.organization_id)
        if user.role != "dispatcher_admin" and user.carrier_id:
            query = query.eq("carrier_id", user.carrier_id)
        result = query.execute()
        data = result.data or []
        total = result.count if result.count is not None else len(data)
    except Exception:
        invoices = _get_invoices_mem()
        data = [
            iv for iv in invoices
            if iv.get("organization_id") == user.organization_id
            and not iv.get("deleted_at")
            and iv.get("status") in ("sent", "overdue")
        ]
        if user.role != "dispatcher_admin" and user.carrier_id:
            data = [iv for iv in data if iv.get("carrier_id") == user.carrier_id]
        total = len(data)

    data = _enrich_invoices(data, user.organization_id or "", sb=None)
    data.sort(
        key=lambda x: (
            _PRIORITY_RANK.get(x.get("priority", "low"), 2),
            -int(x.get("days_outstanding", 0) or 0),
        )
    )
    return ok(data, total=total)


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    try:
        sb = get_supabase()
        result = (
            sb.table("invoices")
            .select("*")
            .eq("id", invoice_id)
            .eq("organization_id", user.organization_id)
            .is_("deleted_at", "null")
            .maybe_single()
            .execute()
        )
        if not result or not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        return ok(_enrich_invoices([result.data], user.organization_id, sb=sb)[0])
    except HTTPException:
        raise
    except Exception:
        inv = next((iv for iv in _get_invoices_mem() if iv.get("id") == invoice_id and iv.get("organization_id") == user.organization_id), None)
        if not inv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        return ok(_enrich_invoices([inv], user.organization_id)[0])


@router.patch("/{invoice_id}")
def update_invoice(
    invoice_id: str,
    payload: InvoiceStatusUpdate,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    is_dispatcher = user.role == "dispatcher_admin"
    updates: dict = {}

    if payload.status:
        updates["status"] = payload.status
    if payload.paid_date:
        updates["paid_date"] = payload.paid_date
    elif payload.status == "paid" and not payload.paid_date:
        updates["paid_date"] = str(date.today())
    if payload.carrier_id:
        updates["carrier_id"] = payload.carrier_id
    if payload.customer_ap_email is not None:
        updates["customer_ap_email"] = payload.customer_ap_email
    if payload.amount is not None:
        updates["amount"] = payload.amount
    if payload.notes is not None:
        updates["notes"] = payload.notes
    if payload.issued_date is not None:
        updates["issued_date"] = payload.issued_date
    if payload.due_date is not None:
        updates["due_date"] = payload.due_date
    if payload.invoice_number is not None:
        updates["invoice_number"] = _normalize_invoice_number(payload.invoice_number, invoice_id[:8])

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        sb = get_supabase()
        query = sb.table("invoices").update(updates).eq("id", invoice_id)
        if is_dispatcher:
            query = query.eq("organization_id", user.organization_id)
        elif user.carrier_id:
            query = query.eq("carrier_id", user.carrier_id)
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        result = safe_execute(query)
        if result.data:
            for iv in _get_invoices_mem():
                if iv.get("id") == invoice_id:
                    iv.update(updates)
            return ok(result.data[0])
    except HTTPException:
        raise
    except Exception:
        pass

    for iv in _get_invoices_mem():
        if iv.get("id") != invoice_id:
            continue
        if is_dispatcher and iv.get("organization_id") == user.organization_id:
            iv.update(updates)
            return ok(iv)
        elif user.carrier_id and iv.get("carrier_id") == user.carrier_id:
            iv.update(updates)
            return ok(iv)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")


@router.post("/{invoice_id}/send")
def send_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    """Mark invoice as sent to the customer AP email. Accessible by dispatchers and carriers."""
    sb = get_supabase()

    # Build ownership filter based on role
    is_dispatcher = user.role == "dispatcher_admin"

    # Check DB
    db_inv = None
    try:
        query = (
            sb.table("invoices")
            .select("*")
            .eq("id", invoice_id)
            .is_("deleted_at", "null")
        )
        if is_dispatcher and user.organization_id:
            query = query.eq("organization_id", user.organization_id)
        elif user.carrier_id:
            query = query.eq("carrier_id", user.carrier_id)
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        result = query.maybe_single().execute()
        if result and result.data:
            db_inv = result.data
    except HTTPException:
        raise
    except Exception:
        pass

    # Also check in-memory
    invoices = _get_invoices_mem()
    inv = None
    for iv in invoices:
        if iv.get("id") != invoice_id:
            continue
        if is_dispatcher and iv.get("organization_id") == user.organization_id:
            inv = iv
            break
        elif user.carrier_id and iv.get("carrier_id") == user.carrier_id:
            inv = iv
            break

    target = inv or db_inv
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    ap_email = target.get("customer_ap_email") or ""
    if not ap_email:
        # Try to pull from linked load via DB
        load_id = target.get("load_id")
        if load_id:
            try:
                ld_result = sb.table("loads").select("customer_ap_email").eq("id", load_id).maybe_single().execute()
                if ld_result and ld_result.data:
                    ap_email = ld_result.data.get("customer_ap_email") or ""
            except Exception:
                pass
        if not ap_email and is_dispatcher:
            loads = {ld.get("id"): ld for ld in _get_loads_mem() if ld.get("organization_id") == user.organization_id}
            if load_id and load_id in loads:
                ap_email = loads[load_id].get("customer_ap_email") or ""

    updates = {
        "status": "sent",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        safe_execute(
            sb.table("invoices").update(updates).eq("id", invoice_id)
        )
    except Exception:
        pass

    # Update in-memory
    for iv in invoices:
        if iv.get("id") == invoice_id:
            iv.update(updates)

    return ok({"invoice_id": invoice_id, "status": "sent", "sent_to": ap_email})


@router.delete("/{invoice_id}", status_code=200)
def delete_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    is_dispatcher = user.role == "dispatcher_admin"
    now_iso = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    try:
        query = sb.table("invoices").update({"deleted_at": now_iso}).eq("id", invoice_id)
        if is_dispatcher:
            query = query.eq("organization_id", user.organization_id)
        elif user.carrier_id:
            query = query.eq("carrier_id", user.carrier_id)
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        result = query.execute()
        if result.data:
            for iv in _get_invoices_mem():
                if iv.get("id") == invoice_id:
                    iv["deleted_at"] = now_iso
            return ok({"deleted": True})
    except HTTPException:
        raise
    except Exception as e:
        logger.error("DB delete_invoice failed: %s", e)

    for iv in _get_invoices_mem():
        if iv.get("id") != invoice_id:
            continue
        if is_dispatcher and iv.get("organization_id") == user.organization_id:
            iv["deleted_at"] = now_iso
            return ok({"deleted": True})
        elif user.carrier_id and iv.get("carrier_id") == user.carrier_id:
            iv["deleted_at"] = now_iso
            return ok({"deleted": True})
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
