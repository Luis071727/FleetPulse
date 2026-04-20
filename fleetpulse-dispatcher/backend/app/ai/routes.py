from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.ai.service import AIService
from app.common.schemas import ResponseEnvelope, ok
from app.config import get_supabase, safe_execute
from app.invoices.routes import _enrich_invoices
from app.invoices.service import InvoiceFollowupService
from app.middleware.auth import CurrentUser, require_authenticated, require_dispatcher


router = APIRouter(prefix="/ai", tags=["ai"])
_ai_service = AIService()
_followup_service = InvoiceFollowupService()


class AnalyzeLoadIn(BaseModel):
    load_id: str
    force_refresh: bool = False


class ScoreBrokerIn(BaseModel):
    broker_id: str
    force_fmcsa_refresh: bool = False


class InvoiceFollowupIn(BaseModel):
    invoice_id: str
    override_tone: str | None = None


# ---------- POST /ai/load/analyze ----------

@router.post("/load/analyze")
def analyze_load(
    payload: AnalyzeLoadIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    sb = get_supabase()
    result = (
        sb.table("loads")
        .select("*")
        .eq("id", payload.load_id)
        .eq("organization_id", user.organization_id)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Load not found")
    load = result.data

    net_rpm = float(load.get("net_rpm") or 0)
    trust_score = float(load.get("broker_trust_score") or 50)
    carrier_status = load.get("carrier_status", "active")
    gross_rate = float(load.get("rate") or 0)

    try:
        rec = _ai_service.analyze_load(
            load_id=payload.load_id,
            net_rpm=net_rpm,
            trust_score=trust_score,
            carrier_status=carrier_status,
            gross_rate=gross_rate,
            force_refresh=payload.force_refresh,
        )
    except Exception as ex:
        raise HTTPException(
            status_code=503,
            detail=f"AI service failure: {ex}",
        )

    return ok({
        "load_id": payload.load_id,
        "recommendation": rec.recommendation,
        "reasoning": rec.reasoning,
        "target_rate": rec.target_rate,
        "summary_metrics": {
            "net_rpm": net_rpm,
            "broker_trust_score": trust_score,
            "carrier_status": carrier_status,
            "go_threshold_met": net_rpm >= 1.5 and trust_score >= 70,
            "negotiate_threshold_met": not (net_rpm >= 1.5 and trust_score >= 70)
                and not (net_rpm < 1.0 or trust_score < 50),
        },
        "cache_hit": rec.cache_hit,
        "tokens_used": rec.tokens_used,
    })


# ---------- POST /ai/broker/score ----------

@router.post("/broker/score")
def score_broker(
    payload: ScoreBrokerIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    sb = get_supabase()
    result = (
        sb.table("brokers")
        .select("*")
        .eq("id", payload.broker_id)
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Broker not found")
    broker = result.data

    if payload.force_fmcsa_refresh and broker.get("mc_number"):
        from app.fmcsa.cache import FmcsaCacheService
        cache_svc = FmcsaCacheService()
        try:
            fresh = cache_svc.get_or_fetch_broker(broker["mc_number"])
            if fresh:
                safe_execute(sb.table("brokers").update({
                    "operating_status": fresh.get("operating_status"),
                    "authority_status": fresh.get("authority_status"),
                    "fmcsa_last_pulled_at": fresh.get("fetched_at"),
                }).eq("id", broker["id"]))
                broker.update(fresh)
        except Exception:
            pass  # proceed with existing data

    trust_score = float(broker.get("trust_score") or 50)
    fmcsa_authority = 100.0 if broker.get("authority_status") == "AUTHORIZED" else 0.0
    fmcsa_operating = 100.0 if broker.get("operating_status") == "AUTHORIZED" else 0.0
    source = "fmcsa" if broker.get("fmcsa_last_pulled_at") else "payment_history"

    if trust_score >= 70:
        rec = "GO"
    elif trust_score >= 50:
        rec = "NEGOTIATE"
    else:
        rec = "CAUTION"

    return ok({
        "broker_id": payload.broker_id,
        "trust_score": trust_score,
        "source": source,
        "components": {
            "fmcsa_authority_pct": fmcsa_authority,
            "fmcsa_operating_history_pct": fmcsa_operating,
            "payment_days_avg": broker.get("payment_days_avg"),
            "payment_days_p90": broker.get("payment_days_p90"),
            "late_payment_rate": broker.get("late_payment_rate"),
            "fraud_flags": broker.get("fraud_flags") or [],
        },
        "recommendation": rec,
    })


# ---------- POST /ai/invoice/followup ----------

@router.post("/invoice/followup")
def invoice_followup(
    payload: InvoiceFollowupIn,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    sb = get_supabase()
    is_dispatcher = user.role == "dispatcher_admin"
    query = (
        sb.table("invoices")
        .select("*")
        .eq("id", payload.invoice_id)
        .is_("deleted_at", "null")
    )
    if is_dispatcher:
        if not user.organization_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        query = query.eq("organization_id", user.organization_id)
    elif user.carrier_id:
        query = query.eq("carrier_id", user.carrier_id)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = query.maybe_single().execute()
    if not result or not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    # Carrier-created invoices may have organization_id = None; enrichment tolerates that.
    enrich_org_id = result.data.get("organization_id") or user.organization_id or ""
    invoice = _enrich_invoices([result.data], enrich_org_id, sb=sb)[0]

    days = invoice.get("days_outstanding", 0)
    tone = _followup_service.tone_for_days(days, payload.override_tone)

    # Look up broker name if load has broker_id
    broker_name = invoice.get("broker_name") or None
    if invoice.get("load_id"):
        load_res = sb.table("loads").select("broker_id, broker_name").eq("id", invoice["load_id"]).maybe_single().execute()
        if load_res and load_res.data and load_res.data.get("broker_name") and not broker_name:
            broker_name = load_res.data.get("broker_name")
        if load_res and load_res.data and load_res.data.get("broker_id") and not broker_name:
            broker_res = (
                sb.table("brokers")
                .select("legal_name")
                .eq("id", load_res.data["broker_id"])
                .maybe_single()
                .execute()
            )
            if broker_res and broker_res.data:
                broker_name = broker_res.data.get("legal_name")

    try:
        ai_result = _ai_service.draft_followup(invoice, tone, broker_name)
    except Exception:
        # Fallback to template
        draft = _followup_service.draft(invoice, broker_name=broker_name, override_tone=tone)
        ai_result = type("R", (), {
            "subject": draft.subject,
            "body": draft.body,
            "tone": draft.tone,
            "cache_hit": False,
            "tokens_used": {},
        })()

    # Record followup in DB
    new_count = _followup_service.increment_and_record(invoice, tone)

    return ok({
        "invoice_id": payload.invoice_id,
        "followup_count": new_count,
        "tone": ai_result.tone,
        "draft_message": ai_result.body,
        "subject_line": ai_result.subject,
        "cache_hit": ai_result.cache_hit,
        "tokens_used": ai_result.tokens_used,
    })


# ---------- POST /ai/insurance/playbook (Phase 2 stub) ----------

@router.post("/insurance/playbook")
def insurance_playbook() -> ResponseEnvelope:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Insurance Intelligence (Phase 2) not yet available",
    )
