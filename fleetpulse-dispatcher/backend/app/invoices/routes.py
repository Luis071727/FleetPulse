import logging
from datetime import date, datetime, timezone

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


def _enrich_invoices(invoices: list[dict], org_id: str) -> list[dict]:
    """Add carrier_name and compute days_outstanding from the linked load's delivery date."""
    if not invoices:
        return invoices

    # Build lookup maps from in-memory stores
    carriers = {c.get("id"): c for c in _get_carriers_mem() if c.get("organization_id") == org_id}
    loads = {ld.get("id"): ld for ld in _get_loads_mem() if ld.get("organization_id") == org_id}

    today = date.today()
    for inv in invoices:
        # Carrier name lookup
        carrier_id = inv.get("carrier_id")
        if carrier_id and carrier_id in carriers:
            inv["carrier_name"] = carriers[carrier_id].get("legal_name", "—")
        elif not inv.get("carrier_name"):
            inv["carrier_name"] = "—"

        # Enrich from linked load: customer (broker_name), AP email, delivery-based days
        load_id = inv.get("load_id")
        if load_id and load_id in loads:
            load = loads[load_id]
            # Customer name = broker_name on the load
            if not inv.get("broker_name"):
                inv["broker_name"] = load.get("broker_name") or "—"
            # AP email from load
            if not inv.get("customer_ap_email"):
                inv["customer_ap_email"] = load.get("customer_ap_email") or ""

        # Compute days_outstanding from delivery_date to today
        if inv.get("status") not in ("paid",):
            load_id = inv.get("load_id")
            if load_id and load_id in loads:
                load = loads[load_id]
                delivered_date_str = load.get("actual_delivery_at") or load.get("delivery_date")
                if delivered_date_str:
                    try:
                        delivered = datetime.fromisoformat(str(delivered_date_str)).date() if "T" in str(delivered_date_str) else date.fromisoformat(str(delivered_date_str))
                        inv["days_outstanding"] = max((today - delivered).days, 0)
                    except (ValueError, TypeError):
                        pass
                else:
                    # No delivery date — fall back to issued_date
                    try:
                        issued = date.fromisoformat(str(inv.get("issued_date", "")))
                        inv["days_outstanding"] = max((today - issued).days, 0)
                    except (ValueError, TypeError):
                        pass

            # Auto-flag overdue when days > 30
            days = inv.get("days_outstanding", 0)
            if isinstance(days, (int, float)) and days > 30 and inv.get("status") in ("pending", "sent"):
                inv["status"] = "overdue"

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


class CreateInvoiceIn(BaseModel):
    carrier_id: str
    broker_mc: str | None = None
    amount: float
    issued_date: str | None = None
    due_date: str | None = None
    load_id: str | None = None
    notes: str | None = None


@router.post("", status_code=201)
def create_invoice(
    payload: CreateInvoiceIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    from uuid import uuid4

    org_id = user.organization_id
    now_iso = datetime.now(timezone.utc).isoformat()

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
        c = next((c for c in carriers if c.get("id") == payload.carrier_id), None)
        if c:
            carrier_name = c.get("legal_name", "—")
    except Exception:
        pass

    inv_id = str(uuid4())
    invoice_row = {
        "id": inv_id,
        "organization_id": org_id,
        "load_id": payload.load_id,
        "carrier_id": payload.carrier_id,
        "carrier_name": carrier_name,
        "broker_id": broker_id,
        "amount": payload.amount,
        "status": "pending",
        "followups_sent": 0,
        "issued_date": payload.issued_date or str(date.today()),
        "due_date": payload.due_date or str(date.today()),
        "notes": payload.notes,
        "created_at": now_iso,
    }

    try:
        sb = get_supabase()
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
        data = _enrich_invoices(data, user.organization_id)

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
        return ok(result.data)
    except HTTPException:
        raise
    except Exception:
        inv = next((iv for iv in _get_invoices_mem() if iv.get("id") == invoice_id and iv.get("organization_id") == user.organization_id), None)
        if not inv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        return ok(inv)


@router.patch("/{invoice_id}")
def update_invoice(
    invoice_id: str,
    payload: InvoiceStatusUpdate,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
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

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        sb = get_supabase()
        result = safe_execute(
            sb.table("invoices")
            .update(updates)
            .eq("id", invoice_id)
            .eq("organization_id", user.organization_id)
        )
        if result.data:
            # Also update in-memory
            for iv in _get_invoices_mem():
                if iv.get("id") == invoice_id:
                    iv.update(updates)
            return ok(result.data[0])
    except Exception:
        pass

    # Fallback: update in-memory
    for iv in _get_invoices_mem():
        if iv.get("id") == invoice_id and iv.get("organization_id") == user.organization_id:
            iv.update(updates)
            return ok(iv)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")


@router.post("/{invoice_id}/send")
def send_invoice(
    invoice_id: str,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    """Mark invoice as sent to the customer AP email."""
    invoices = _get_invoices_mem()
    inv = next((iv for iv in invoices if iv.get("id") == invoice_id and iv.get("organization_id") == user.organization_id), None)

    # Also check DB
    db_inv = None
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
        if result and result.data:
            db_inv = result.data
    except Exception:
        pass

    target = inv or db_inv
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    ap_email = target.get("customer_ap_email") or ""
    if not ap_email:
        # Try to pull from linked load
        load_id = target.get("load_id")
        if load_id:
            loads = {ld.get("id"): ld for ld in _get_loads_mem() if ld.get("organization_id") == user.organization_id}
            if load_id in loads:
                ap_email = loads[load_id].get("customer_ap_email") or ""

    updates = {
        "status": "sent",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        sb = get_supabase()
        safe_execute(
            sb.table("invoices").update(updates).eq("id", invoice_id).eq("organization_id", user.organization_id)
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
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    now_iso = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    try:
        result = (
            sb.table("invoices")
            .update({"deleted_at": now_iso})
            .eq("id", invoice_id)
            .eq("organization_id", user.organization_id)
            .execute()
        )
        if result.data:
            for iv in _get_invoices_mem():
                if iv.get("id") == invoice_id:
                    iv["deleted_at"] = now_iso
            return ok({"deleted": True})
    except Exception as e:
        logger.error("DB delete_invoice failed: %s", e)

    # Fallback: mark in-memory
    for iv in _get_invoices_mem():
        if iv.get("id") == invoice_id and iv.get("organization_id") == user.organization_id:
            iv["deleted_at"] = now_iso
            return ok({"deleted": True})
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
