import logging
from datetime import date, datetime, timedelta
from uuid import uuid4

from app.config import get_supabase

logger = logging.getLogger(__name__)

_PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _action(
    type_: str,
    title: str,
    description: str,
    priority: str,
    entity_id: str,
    entity_type: str,
    cta_label: str,
    cta_action: str,
    due_in_days: int | None = None,
) -> dict:
    return {
        "id": str(uuid4()),
        "type": type_,
        "title": title,
        "description": description,
        "priority": priority,
        "due_in_days": due_in_days,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "cta": {"label": cta_label, "action": cta_action},
    }


def _invoice_priority(days: int) -> str:
    if days >= 30:
        return "high"
    if days >= 14:
        return "medium"
    return "low"


def _compliance_priority(days_remaining: int | None) -> str:
    if days_remaining is None or days_remaining < 0:
        return "high"
    if days_remaining < 7:
        return "high"
    return "medium"


def _parse_date(value: str) -> date | None:
    if not value:
        return None
    try:
        raw = str(value)
        return datetime.fromisoformat(raw).date() if "T" in raw else date.fromisoformat(raw[:10])
    except (ValueError, TypeError):
        return None


def get_todays_actions(user) -> list[dict]:
    """Compute today's actionable tasks for a dispatcher or carrier."""
    is_dispatcher = user.role == "dispatcher_admin"
    if is_dispatcher and user.organization_id:
        actions = _dispatcher_actions(user)
    elif user.carrier_id:
        actions = _carrier_actions(user)
    else:
        return []

    def _sort_key(a: dict) -> tuple:
        p = _PRIORITY_ORDER.get(a["priority"], 9)
        d = a["due_in_days"] if a["due_in_days"] is not None else 9999
        return (p, d)

    actions.sort(key=_sort_key)
    return actions[:10]


# ── Dispatcher ────────────────────────────────────────────────────────────────

def _dispatcher_actions(user) -> list[dict]:
    sb = get_supabase()
    org_id = user.organization_id
    today = date.today()
    thirty_days_out = str(today + timedelta(days=30))
    actions: list[dict] = []

    # ── 1. Invoices (follow-up + ready-to-send) ───────────────────────────────
    try:
        inv_result = (
            sb.table("invoices")
            .select("id, status, amount, invoice_number, load_id, carrier_name, issued_date")
            .eq("organization_id", org_id)
            .is_("deleted_at", "null")
            .in_("status", ["pending", "sent", "overdue"])
            .execute()
        )
        invoices = inv_result.data or []
    except Exception as exc:
        logger.debug("actions: invoice fetch failed for org %s: %s", org_id, exc)
        invoices = []

    # Fetch load statuses for pending invoices so we can detect invoice_ready
    pending_load_ids = [
        inv["load_id"] for inv in invoices
        if inv.get("status") == "pending" and inv.get("load_id")
    ]
    delivered_load_ids: set[str] = set()
    if pending_load_ids:
        try:
            ld_result = (
                sb.table("loads")
                .select("id, status")
                .in_("id", pending_load_ids)
                .execute()
            )
            delivered_load_ids = {
                ld["id"] for ld in (ld_result.data or []) if ld.get("status") == "delivered"
            }
        except Exception:
            pass

    for inv in invoices:
        inv_id = inv["id"]
        carrier_name = inv.get("carrier_name") or "Unknown carrier"
        amount = float(inv.get("amount") or 0)
        inv_num = (inv.get("invoice_number") or inv_id[:8]).upper()[:8]
        inv_status = inv.get("status", "")
        load_id = inv.get("load_id")

        if inv_status in ("sent", "overdue"):
            issued_str = inv.get("issued_date")
            issued = _parse_date(issued_str) if issued_str else None
            days = max((today - issued).days, 0) if issued else 0

            if days > 3:
                priority = _invoice_priority(days)
                actions.append(_action(
                    type_="invoice_followup",
                    title=f"Follow up: INV-{inv_num}",
                    description=f"{carrier_name} · ${amount:,.0f} · {days}d outstanding",
                    priority=priority,
                    entity_id=inv_id,
                    entity_type="invoice",
                    cta_label="Send Follow-up",
                    cta_action=f"/invoices?invoiceId={inv_id}",
                    due_in_days=days,
                ))

        elif inv_status == "pending" and load_id and load_id in delivered_load_ids:
            actions.append(_action(
                type_="invoice_ready",
                title=f"Invoice ready: INV-{inv_num}",
                description=f"{carrier_name} · ${amount:,.0f} · Load delivered",
                priority="medium",
                entity_id=inv_id,
                entity_type="invoice",
                cta_label="Send Invoice",
                cta_action=f"/invoices?invoiceId={inv_id}&send=1",
            ))

    # ── 2. Missing POD (delivered loads without proof of delivery) ────────────
    try:
        delivered_result = (
            sb.table("loads")
            .select("id, origin, destination")
            .eq("organization_id", org_id)
            .eq("status", "delivered")
            .is_("deleted_at", "null")
            .limit(50)
            .execute()
        )
        delivered_loads = delivered_result.data or []
    except Exception as exc:
        logger.debug("actions: delivered loads fetch failed: %s", exc)
        delivered_loads = []

    if delivered_loads:
        dl_ids = [ld["id"] for ld in delivered_loads]

        load_to_invoice: dict[str, str] = {}
        try:
            inv_map_result = (
                sb.table("invoices")
                .select("id, load_id")
                .in_("load_id", dl_ids)
                .is_("deleted_at", "null")
                .execute()
            )
            load_to_invoice = {row["load_id"]: row["id"] for row in (inv_map_result.data or [])}
        except Exception:
            pass

        invoice_ids_with_pod: set[str] = set()
        invoice_ids_to_check = list(load_to_invoice.values())
        if invoice_ids_to_check:
            try:
                pod_result = (
                    sb.table("invoice_documents")
                    .select("invoice_id")
                    .in_("invoice_id", invoice_ids_to_check)
                    .eq("doc_type", "POD")
                    .execute()
                )
                invoice_ids_with_pod = {row["invoice_id"] for row in (pod_result.data or [])}
            except Exception:
                pass

        for ld in delivered_loads:
            load_id = ld["id"]
            invoice_id = load_to_invoice.get(load_id)
            if invoice_id and invoice_id not in invoice_ids_with_pod:
                origin = ld.get("origin") or "—"
                dest = ld.get("destination") or "—"
                actions.append(_action(
                    type_="paperwork_pending",
                    title=f"POD missing: {origin} → {dest}",
                    description="Proof of delivery not yet received for this load",
                    priority="medium",
                    entity_id=invoice_id,
                    entity_type="invoice",
                    cta_label="View Documents",
                    cta_action=f"/invoices?invoiceId={invoice_id}&tab=documents",
                ))

    # ── 3. Compliance expiring (across all org's carriers) ────────────────────
    try:
        carriers_result = (
            sb.table("carriers")
            .select("id, legal_name")
            .eq("organization_id", org_id)
            .execute()
        )
        carrier_rows = carriers_result.data or []
    except Exception:
        carrier_rows = []

    if carrier_rows:
        cid_to_name = {c["id"]: c.get("legal_name", "Unknown") for c in carrier_rows}
        carrier_ids = list(cid_to_name.keys())

        try:
            comp_result = (
                sb.table("compliance_documents")
                .select("id, carrier_id, doc_type, label, expires_at")
                .in_("carrier_id", carrier_ids)
                .or_("is_active.is.null,is_active.eq.true")
                .not_("expires_at", "is", "null")
                .lte("expires_at", thirty_days_out)
                .order("expires_at", desc=False)
                .execute()
            )
            comp_docs = comp_result.data or []
        except Exception as exc:
            logger.debug("actions: compliance fetch failed: %s", exc)
            comp_docs = []

        for doc in comp_docs:
            cid = doc.get("carrier_id", "")
            carrier_name = cid_to_name.get(cid, "Unknown carrier")
            doc_label = doc.get("label") or doc.get("doc_type", "Document")
            exp_date = _parse_date(doc.get("expires_at") or "")
            days_remaining = (exp_date - today).days if exp_date else None
            priority = _compliance_priority(days_remaining)
            is_expired = days_remaining is not None and days_remaining < 0

            title = f"Expired: {doc_label}" if is_expired else f"Expiring: {doc_label}"
            if is_expired and days_remaining is not None:
                desc = f"{carrier_name} · {doc_label} · expired {abs(days_remaining)}d ago"
            elif days_remaining is not None:
                desc = f"{carrier_name} · {doc_label} · {days_remaining}d left"
            else:
                desc = f"{carrier_name} · {doc_label}"

            actions.append(_action(
                type_="compliance_expiring",
                title=title,
                description=desc,
                priority=priority,
                entity_id=cid,
                entity_type="carrier_doc",
                cta_label="View Documents",
                cta_action=f"/carriers?carrierId={cid}&tab=documents",
                due_in_days=days_remaining,
            ))

    return actions


# ── Carrier ───────────────────────────────────────────────────────────────────

def _carrier_actions(user) -> list[dict]:
    sb = get_supabase()
    carrier_id = user.carrier_id
    today = date.today()
    thirty_days_out = str(today + timedelta(days=30))
    actions: list[dict] = []

    # ── 1. Pending paperwork requests ─────────────────────────────────────────
    try:
        inv_result = (
            sb.table("invoices")
            .select("id, load_id, invoice_number")
            .eq("carrier_id", carrier_id)
            .is_("deleted_at", "null")
            .execute()
        )
        carrier_invoices = inv_result.data or []
    except Exception:
        carrier_invoices = []

    if carrier_invoices:
        inv_map = {i["id"]: i for i in carrier_invoices}
        inv_ids = list(inv_map.keys())

        try:
            req_result = (
                sb.table("invoice_document_requests")
                .select("id, invoice_id, doc_types, token, expires_at")
                .in_("invoice_id", inv_ids)
                .eq("status", "pending")
                .execute()
            )
            pending_requests = req_result.data or []
        except Exception:
            pending_requests = []

        if pending_requests:
            load_ids_needed = list({
                inv_map[r["invoice_id"]]["load_id"]
                for r in pending_requests
                if inv_map.get(r.get("invoice_id", ""), {}).get("load_id")
            })
            loads_map: dict = {}
            if load_ids_needed:
                try:
                    ld_result = (
                        sb.table("loads")
                        .select("id, origin, destination")
                        .in_("id", load_ids_needed)
                        .execute()
                    )
                    loads_map = {ld["id"]: ld for ld in (ld_result.data or [])}
                except Exception:
                    pass

            from app.config import settings as _settings
            dispatcher_url = getattr(_settings, "dispatcher_url", "http://localhost:3001").rstrip("/")

            for req in pending_requests:
                inv_id = req["invoice_id"]
                inv_data = inv_map.get(inv_id, {})
                load_id = inv_data.get("load_id")
                ld = loads_map.get(load_id, {}) if load_id else {}
                origin = ld.get("origin", "")
                dest = ld.get("destination", "")
                lane = f"{origin} → {dest}" if (origin or dest) else "Load"
                doc_types = req.get("doc_types") or []
                doc_list = ", ".join(doc_types) if doc_types else "Documents"
                magic_link = f"{dispatcher_url}/upload/{req['token']}"

                actions.append(_action(
                    type_="paperwork_pending",
                    title=f"Paperwork needed: {lane}",
                    description=f"Docs required: {doc_list}",
                    priority="medium",
                    entity_id=req["id"],
                    entity_type="invoice",
                    cta_label="Copy Link",
                    cta_action=f"copy:{magic_link}",
                ))

    # ── 2. Compliance expiring ────────────────────────────────────────────────
    try:
        comp_result = (
            sb.table("compliance_documents")
            .select("id, doc_type, label, expires_at")
            .eq("carrier_id", carrier_id)
            .or_("is_active.is.null,is_active.eq.true")
            .not_("expires_at", "is", "null")
            .lte("expires_at", thirty_days_out)
            .order("expires_at", desc=False)
            .execute()
        )
        comp_docs = comp_result.data or []
    except Exception as exc:
        logger.debug("actions: carrier compliance fetch failed: %s", exc)
        comp_docs = []

    for doc in comp_docs:
        doc_label = doc.get("label") or doc.get("doc_type", "Document")
        exp_date = _parse_date(doc.get("expires_at") or "")
        days_remaining = (exp_date - today).days if exp_date else None
        priority = _compliance_priority(days_remaining)
        is_expired = days_remaining is not None and days_remaining < 0

        title = f"Expired: {doc_label}" if is_expired else f"Expiring: {doc_label}"
        if is_expired and days_remaining is not None:
            desc = f"{doc_label} · expired {abs(days_remaining)}d ago"
        elif days_remaining is not None:
            desc = f"{doc_label} · {days_remaining}d left"
        else:
            desc = doc_label

        actions.append(_action(
            type_="compliance_expiring",
            title=title,
            description=desc,
            priority=priority,
            entity_id=doc["id"],
            entity_type="carrier_doc",
            cta_label="Renew",
            cta_action="/compliance",
            due_in_days=days_remaining,
        ))

    # ── 3. Invoices ready to send ─────────────────────────────────────────────
    try:
        pending_inv_result = (
            sb.table("invoices")
            .select("id, amount, invoice_number, load_id")
            .eq("carrier_id", carrier_id)
            .eq("status", "pending")
            .is_("deleted_at", "null")
            .execute()
        )
        pending_invs = pending_inv_result.data or []
    except Exception:
        pending_invs = []

    if pending_invs:
        pend_load_ids = [i["load_id"] for i in pending_invs if i.get("load_id")]
        ld_data: dict = {}
        if pend_load_ids:
            try:
                ld_r = (
                    sb.table("loads")
                    .select("id, status, origin, destination")
                    .in_("id", pend_load_ids)
                    .execute()
                )
                ld_data = {ld["id"]: ld for ld in (ld_r.data or [])}
            except Exception:
                pass

        for inv in pending_invs:
            load_id = inv.get("load_id")
            if not load_id:
                continue
            ld = ld_data.get(load_id, {})
            if ld.get("status") != "delivered":
                continue
            origin = ld.get("origin", "")
            dest = ld.get("destination", "")
            lane = f"{origin} → {dest}" if (origin or dest) else "Delivered load"
            amount = float(inv.get("amount") or 0)
            inv_num = (inv.get("invoice_number") or inv["id"][:8]).upper()[:8]
            actions.append(_action(
                type_="invoice_ready",
                title=f"Invoice ready: INV-{inv_num}",
                description=f"{lane} · ${amount:,.0f}",
                priority="medium",
                entity_id=inv["id"],
                entity_type="invoice",
                cta_label="Send Invoice",
                cta_action=f"send_invoice:{inv['id']}",
            ))

    # ── 4. Invoice follow-ups ─────────────────────────────────────────────────
    try:
        followup_result = (
            sb.table("invoices")
            .select("id, amount, invoice_number, status, issued_date")
            .eq("carrier_id", carrier_id)
            .in_("status", ["sent", "overdue"])
            .is_("deleted_at", "null")
            .execute()
        )
        followup_invs = followup_result.data or []
    except Exception:
        followup_invs = []

    for inv in followup_invs:
        inv_id = inv["id"]
        amount = float(inv.get("amount") or 0)
        inv_num = (inv.get("invoice_number") or inv_id[:8]).upper()[:8]
        issued_str = inv.get("issued_date")
        issued = _parse_date(issued_str) if issued_str else None
        days = max((today - issued).days, 0) if issued else 0
        priority = _invoice_priority(days)

        actions.append(_action(
            type_="invoice_followup",
            title=f"Follow up: INV-{inv_num}",
            description=f"${amount:,.0f} · {days}d outstanding",
            priority=priority,
            entity_id=inv_id,
            entity_type="invoice",
            cta_label="Draft Follow-up",
            cta_action=f"followup:{inv_id}",
            due_in_days=days,
        ))

    return actions
