import logging
from uuid import uuid4

from app.config import get_supabase, safe_execute
from app.fmcsa.cache import FmcsaCacheService

logger = logging.getLogger(__name__)

# In-memory broker store
_BROKERS: list[dict] = []


class BrokerService:
    def __init__(self) -> None:
        self._fmcsa = FmcsaCacheService()

    def get_or_create_by_mc(self, mc_number: str) -> dict:
        """Get broker by MC number, creating from FMCSA on first encounter (FR-014a)."""
        # Check in-memory first
        for b in _BROKERS:
            if b.get("mc_number") == mc_number:
                return b

        # Try DB lookup
        try:
            sb = get_supabase()
            result = sb.table("brokers").select("*").eq("mc_number", mc_number).maybe_single().execute()
            if result and result.data:
                _BROKERS.append(result.data)
                return result.data
        except Exception:
            logger.debug("DB broker lookup failed, using in-memory")

        # First encounter: look up from FMCSA and compute initial trust score
        try:
            fmcsa_result, _ = self._fmcsa.get_or_fetch_broker(mc_number)
            found = fmcsa_result.found
            fmcsa_data = fmcsa_result.data if found else {}
        except Exception:
            found = False
            fmcsa_data = {}

        # Initial trust: authority_status 70% + operating_history 30% (FR-014a)
        authority_pct = 80.0 if (found and fmcsa_data.get("authority_status") == "active") else 40.0
        operating_pct = 70.0 if found else 30.0
        initial_trust = round(authority_pct * 0.7 + operating_pct * 0.3, 2)

        row = {
            "id": str(uuid4()),
            "mc_number": mc_number,
            "legal_name": fmcsa_data.get("legal_name") if found else f"Broker {mc_number}",
            "authority_status": fmcsa_data.get("authority_status") if found else "unknown",
            "operating_status": fmcsa_data.get("operating_status") if found else None,
            "trust_score": initial_trust,
            "trust_score_source": "fmcsa",
            "fraud_flags": 0,
        }

        # Best-effort DB insert
        try:
            sb = get_supabase()
            insert = safe_execute(sb.table("brokers").insert(row), fallback=[row])
            if insert.data and insert.data[0].get("id"):
                row = insert.data[0]
        except Exception:
            pass

        _BROKERS.append(row)
        return row

    def get_by_id(self, broker_id: str) -> dict | None:
        # Check in-memory
        for b in _BROKERS:
            if b.get("id") == broker_id:
                return b
        try:
            sb = get_supabase()
            result = sb.table("brokers").select("*").eq("id", broker_id).maybe_single().execute()
            return result.data if result else None
        except Exception:
            return None

    def list_brokers(
        self,
        *,
        sort_by: str = "trust_score",
        order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        try:
            sb = get_supabase()
            query = (
                sb.table("brokers")
                .select("*", count="exact")
                .is_("deleted_at", "null")
                .order(sort_by, desc=(order == "desc"))
                .range(offset, offset + limit - 1)
            )
            result = query.execute()
            total = result.count if result.count is not None else len(result.data)
            return result.data or [], total
        except Exception:
            return _BROKERS[offset:offset + limit], len(_BROKERS)
