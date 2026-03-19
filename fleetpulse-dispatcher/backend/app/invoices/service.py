from dataclasses import dataclass
from datetime import datetime, timezone

from app.config import get_supabase, safe_execute


@dataclass
class FollowupDraft:
    tone: str
    subject: str
    body: str
    followup_count: int


class InvoiceFollowupService:
    """FR-019a tone escalation: 7-14d polite, 15-21d firm, 22-29d assertive, 30+ final."""

    def tone_for_days(self, days_outstanding: int, override_tone: str | None = None) -> str:
        if override_tone:
            return override_tone
        if days_outstanding >= 30:
            return "final"
        if days_outstanding >= 22:
            return "assertive"
        if days_outstanding >= 15:
            return "firm"
        return "polite"

    def draft(
        self,
        invoice: dict,
        broker_name: str | None = None,
        override_tone: str | None = None,
    ) -> FollowupDraft:
        invoice_id = invoice["id"]
        amount = float(invoice.get("amount", 0))
        days = invoice.get("days_outstanding", 0)
        inv_number = invoice.get("invoice_number", invoice_id[:8])
        broker = broker_name or "the broker"

        tone = self.tone_for_days(days, override_tone)
        followup_count = (invoice.get("followups_sent") or 0) + 1

        templates = {
            "polite": (
                f"Friendly Reminder: Invoice {inv_number}",
                f"Hi {broker},\n\nThis is a friendly reminder that invoice {inv_number} "
                f"for ${amount:,.2f} is now {days} days outstanding. "
                f"Please let us know the expected payment date at your earliest convenience.\n\n"
                f"Thank you for your prompt attention.",
            ),
            "firm": (
                f"Past Due Notice: Invoice {inv_number}",
                f"Dear {broker},\n\nInvoice {inv_number} for ${amount:,.2f} is now {days} days past due. "
                f"We need a payment ETA within the next 48 hours. "
                f"Please respond to this message or contact us directly.\n\n"
                f"Regards.",
            ),
            "assertive": (
                f"Urgent: Invoice {inv_number} - {days} Days Overdue",
                f"Dear {broker},\n\nInvoice {inv_number} for ${amount:,.2f} has been outstanding for "
                f"{days} days without resolution. This requires immediate attention. "
                f"If payment is not received or a payment plan arranged within 5 business days, "
                f"we will escalate this matter.\n\nPlease treat this as urgent.",
            ),
            "final": (
                f"Final Notice: Invoice {inv_number}",
                f"Dear {broker},\n\nThis is a final notice regarding invoice {inv_number} "
                f"for ${amount:,.2f}, now {days} days outstanding. "
                f"Failure to remit payment within 3 business days will result in escalation "
                f"to collections and suspension of future load assignments.\n\n"
                f"This is our final communication before escalation.",
            ),
        }
        subject, body = templates.get(tone, templates["polite"])
        return FollowupDraft(tone=tone, subject=subject, body=body, followup_count=followup_count)

    def record_followup(self, invoice_id: str, tone: str) -> None:
        sb = get_supabase()
        safe_execute(sb.table("invoices").update({
            "last_followup_tone": tone,
            "last_follow_up_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", invoice_id))

    def increment_and_record(self, invoice: dict, tone: str) -> int:
        sb = get_supabase()
        new_count = (invoice.get("followups_sent") or 0) + 1
        safe_execute(sb.table("invoices").update({
            "followups_sent": new_count,
            "last_followup_tone": tone,
            "last_follow_up_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", invoice["id"]))
        return new_count
