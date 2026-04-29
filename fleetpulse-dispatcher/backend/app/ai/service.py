"""AI Service — Claude integration with prompt caching and threshold logic.

GO:        net_rpm >= 1.50 AND broker_trust >= 70
PASS:      net_rpm <  1.00 OR  broker_trust <  50
NEGOTIATE: everything else  (target_rate computed)
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.config import get_settings, get_supabase, safe_execute

logger = logging.getLogger(__name__)

PINNED_MODEL = "claude-sonnet-4-20250514"

LOAD_SYSTEM_PROMPT = """You are a freight load analyst for a trucking dispatch company.
Given load metrics (net RPM, broker trust score, carrier status), return a JSON object:
{
  "recommendation": "GO" | "NEGOTIATE" | "PASS",
  "reasoning": "<one to two sentence plain-English explanation>",
  "target_rate": <number or null>
}
Rules:
- GO if net_rpm >= 1.50 AND broker_trust_score >= 70
- PASS if net_rpm < 1.00 OR broker_trust_score < 50
- NEGOTIATE otherwise; compute target_rate = gross_rate * 1.15 (round to nearest $50)
- Always include reasoning referencing the specific metric values.
Return ONLY valid JSON, no markdown fences."""

FOLLOWUP_SYSTEM_PROMPT = """You are a professional freight invoice collection assistant.
Generate a follow-up email for an overdue invoice with the specified tone.
Return JSON: {"subject": "...", "body": "..."}
Tones: polite (7-14d), firm (15-21d), assertive (22-29d), final (30+d).
Include the invoice number, amount, and days outstanding in the message. Be concise.
Return ONLY valid JSON, no markdown fences."""


@dataclass
class LoadRecommendation:
    recommendation: str
    reasoning: str
    target_rate: float | None
    cache_hit: bool = False
    tokens_used: dict = field(default_factory=dict)


@dataclass
class FollowupResult:
    subject: str
    body: str
    tone: str
    cache_hit: bool = False
    tokens_used: dict = field(default_factory=dict)


class AIService:
    def __init__(self) -> None:
        self.model = PINNED_MODEL
        self._client = None

    def _get_client(self):
        if self._client is None:
            import anthropic
            settings = get_settings()
            self._client = anthropic.Anthropic(api_key=settings.anthropic_key)
        return self._client

    def _call_claude(self, system_prompt: str, user_message: str) -> tuple[dict, dict]:
        """Call Claude with prompt caching. Returns (parsed_json, tokens_used)."""
        client = self._get_client()
        response = client.messages.create(
            model=self.model,
            max_tokens=512,
            system=[{
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": user_message}],
        )
        raw_text = response.content[0].text
        tokens = {
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
            "cache_creation": getattr(response.usage, "cache_creation_input_tokens", None),
            "cache_read": getattr(response.usage, "cache_read_input_tokens", None),
        }
        parsed = self._parse_json(raw_text)
        return parsed, tokens

    def _parse_json(self, raw: str) -> dict:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]
        try:
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                raise ValueError("Expected JSON object")
            return parsed
        except Exception as ex:
            logger.warning("AI JSON parse failed: %s — raw: %s", ex, raw[:200])
            return {
                "recommendation": "PASS",
                "reasoning": f"Fallback — AI response could not be parsed: {ex}",
                "target_rate": None,
            }

    def _check_cache(self, load_id: str) -> dict | None:
        """Check ai_responses table for a cached recommendation (30-day TTL)."""
        sb = get_supabase()
        result = (
            sb.table("ai_responses")
            .select("*")
            .eq("entity_id", load_id)
            .eq("response_type", "load_analysis")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
            age_days = (datetime.now(timezone.utc) - created).days
            if age_days < 30:
                return row.get("response_data")
        return None

    def _store_response(self, entity_id: str, response_type: str, data: dict, tokens: dict) -> str:
        sb = get_supabase()
        from uuid import uuid4
        row_id = str(uuid4())
        safe_execute(sb.table("ai_responses").insert({
            "id": row_id,
            "entity_id": entity_id,
            "response_type": response_type,
            "model": self.model,
            "response_data": data,
            "tokens_used": tokens,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }))
        return row_id

    def analyze_load(
        self,
        load_id: str,
        net_rpm: float,
        trust_score: float,
        carrier_status: str = "active",
        gross_rate: float | None = None,
        force_refresh: bool = False,
    ) -> LoadRecommendation:
        # Check DB cache first
        if not force_refresh:
            cached = self._check_cache(load_id)
            if cached:
                return LoadRecommendation(
                    recommendation=cached["recommendation"],
                    reasoning=cached["reasoning"],
                    target_rate=cached.get("target_rate"),
                    cache_hit=True,
                    tokens_used={},
                )

        # Threshold-based fallback (when ANTHROPIC_KEY not set)
        settings = get_settings()
        if not settings.anthropic_key:
            return self._threshold_fallback(load_id, net_rpm, trust_score, gross_rate)

        user_msg = (
            f"Load {load_id}: net_rpm={net_rpm:.3f}, broker_trust_score={trust_score:.1f}, "
            f"carrier_status={carrier_status}"
            + (f", gross_rate=${gross_rate:,.2f}" if gross_rate else "")
        )

        try:
            parsed, tokens = self._call_claude(LOAD_SYSTEM_PROMPT, user_msg)
        except Exception as ex:
            logger.error("Claude call failed for load %s: %s", load_id, ex)
            return self._threshold_fallback(load_id, net_rpm, trust_score, gross_rate)

        rec = LoadRecommendation(
            recommendation=parsed.get("recommendation", "PASS"),
            reasoning=parsed.get("reasoning", "No reasoning provided"),
            target_rate=parsed.get("target_rate"),
            cache_hit=False,
            tokens_used=tokens,
        )

        # Store in DB
        try:
            self._store_response(load_id, "load_analysis", {
                "recommendation": rec.recommendation,
                "reasoning": rec.reasoning,
                "target_rate": rec.target_rate,
            }, tokens)
        except Exception:
            logger.warning("Failed to cache AI response for load %s", load_id)

        return rec

    def _threshold_fallback(
        self, load_id: str, net_rpm: float, trust_score: float, gross_rate: float | None
    ) -> LoadRecommendation:
        if net_rpm >= 1.5 and trust_score >= 70:
            rec, target = "GO", None
        elif net_rpm < 1.0 or trust_score < 50:
            rec, target = "PASS", None
        else:
            rec = "NEGOTIATE"
            target = round((gross_rate or 0) * 1.15 / 50) * 50 if gross_rate else None
        return LoadRecommendation(
            recommendation=rec,
            reasoning=f"Threshold evaluation: net_rpm={net_rpm:.3f}, trust_score={trust_score:.1f}",
            target_rate=target,
            cache_hit=False,
            tokens_used={},
        )

    def draft_followup(
        self,
        invoice: dict,
        tone: str,
        broker_name: str | None = None,
    ) -> FollowupResult:
        settings = get_settings()
        inv_number = str(invoice.get("invoice_number") or "").strip() or invoice["id"][:8]
        amount = float(invoice.get("amount", 0))
        days = invoice.get("days_outstanding", 0)
        broker = broker_name or "the broker"

        if not settings.anthropic_key:
            # Use template-based fallback from InvoiceFollowupService
            from app.invoices.service import InvoiceFollowupService
            svc = InvoiceFollowupService()
            draft = svc.draft(invoice, broker_name=broker_name, override_tone=tone)
            return FollowupResult(
                subject=draft.subject,
                body=draft.body,
                tone=draft.tone,
                cache_hit=False,
                tokens_used={},
            )

        followups_sent = int(invoice.get("followups_sent", 0) or 0)
        collection_status = invoice.get("collection_status", "")
        user_msg = (
            f"Invoice {inv_number}, amount ${amount:,.2f}, {days} days outstanding, "
            f"broker: {broker}, tone: {tone}, followups_sent: {followups_sent}"
            + (f", collection_status: {collection_status}" if collection_status else "")
        )
        try:
            parsed, tokens = self._call_claude(FOLLOWUP_SYSTEM_PROMPT, user_msg)
        except Exception as ex:
            logger.error("Claude followup call failed: %s", ex)
            from app.invoices.service import InvoiceFollowupService
            svc = InvoiceFollowupService()
            draft = svc.draft(invoice, broker_name=broker_name, override_tone=tone)
            return FollowupResult(subject=draft.subject, body=draft.body, tone=tone)

        result = FollowupResult(
            subject=parsed.get("subject", f"Follow-up: Invoice {inv_number}"),
            body=parsed.get("body", ""),
            tone=tone,
            cache_hit=False,
            tokens_used=tokens,
        )

        try:
            self._store_response(invoice["id"], "invoice_followup", {
                "subject": result.subject,
                "body": result.body,
                "tone": tone,
            }, tokens)
        except Exception:
            logger.warning("Failed to cache followup response for invoice %s", invoice["id"])

        return result
