"""Cost Guard — SC-010a: track and enforce AI spend budget per organization.

Budget defaults: $200/mo per org. Per-call tracking via ai_responses table.
"""

import logging
from datetime import datetime, timezone

from app.config import get_settings, get_supabase

logger = logging.getLogger(__name__)

# Approximate pricing: Claude Sonnet input=$3/MTok, output=$15/MTok, cache_read=$0.30/MTok
INPUT_COST_PER_TOKEN = 3.0 / 1_000_000
OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000
CACHE_READ_COST_PER_TOKEN = 0.30 / 1_000_000


def estimate_cost(tokens_used: dict) -> float:
    input_t = tokens_used.get("input", 0) or 0
    output_t = tokens_used.get("output", 0) or 0
    cache_read = tokens_used.get("cache_read", 0) or 0
    return (
        input_t * INPUT_COST_PER_TOKEN
        + output_t * OUTPUT_COST_PER_TOKEN
        + cache_read * CACHE_READ_COST_PER_TOKEN
    )


def get_monthly_spend() -> float:
    """Sum AI costs for the current month from ai_responses."""
    sb = get_supabase()
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    result = (
        sb.table("ai_responses")
        .select("tokens_used")
        .gte("created_at", month_start)
        .execute()
    )
    total = 0.0
    for row in result.data or []:
        tokens = row.get("tokens_used") or {}
        total += estimate_cost(tokens)
    return total


def check_budget() -> dict:
    """Return budget status. Blocks new AI calls if over budget."""
    settings = get_settings()
    budget = float(settings.ai_monthly_budget or 200)
    spend = get_monthly_spend()
    over_budget = spend >= budget
    remaining = max(0.0, budget - spend)
    utilization_pct = (spend / budget * 100) if budget > 0 else 0

    if over_budget:
        logger.warning("AI budget exceeded: $%.2f / $%.2f", spend, budget)

    return {
        "month": datetime.now(timezone.utc).strftime("%Y-%m"),
        "spend_usd": round(spend, 4),
        "budget_usd": budget,
        "remaining_usd": round(remaining, 4),
        "utilization_pct": round(utilization_pct, 1),
        "over_budget": over_budget,
    }
