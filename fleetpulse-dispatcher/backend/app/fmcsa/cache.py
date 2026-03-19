import json
import logging
from datetime import datetime, timedelta, timezone

from app.config import get_supabase
from app.fmcsa.client import FmcsaClient, FmcsaResult

logger = logging.getLogger(__name__)


class FmcsaCacheService:
    def __init__(self) -> None:
        self._client = FmcsaClient()

    def get_or_fetch_carrier(self, dot_number: str) -> tuple[FmcsaResult, bool]:
        """Return (result, cache_hit). Checks DB cache first, then FMCSA API."""
        cached = self._get_cached("carrier", dot_number=dot_number)
        if cached is not None:
            return FmcsaResult(found=cached.get("found", True), data=cached), True

        result = self._client.lookup_carrier(dot_number)
        self._set_cached("carrier", result.data, dot_number=dot_number, http_status=200 if result.found else 404)
        return result, False

    def get_or_fetch_broker(self, mc_number: str) -> tuple[FmcsaResult, bool]:
        """Return (result, cache_hit). Checks DB cache first, then FMCSA API."""
        cached = self._get_cached("broker", mc_number=mc_number)
        if cached is not None:
            return FmcsaResult(found=cached.get("found", True), data=cached), True

        result = self._client.lookup_broker(mc_number)
        self._set_cached("broker", result.data, mc_number=mc_number, http_status=200 if result.found else 404)
        return result, False

    def invalidate_carrier(self, dot_number: str) -> None:
        """Invalidate cache for a given DOT number (FR-007a)."""
        try:
            sb = get_supabase()
            sb.table("fmcsa_cache").delete().eq("lookup_type", "carrier").eq("dot_number", dot_number).execute()
        except Exception:
            logger.warning("Failed to invalidate FMCSA cache for DOT %s", dot_number)

    def _get_cached(self, lookup_type: str, *, dot_number: str | None = None, mc_number: str | None = None) -> dict | None:
        try:
            sb = get_supabase()
            query = sb.table("fmcsa_cache").select("response_json, expires_at").eq("lookup_type", lookup_type)
            if dot_number:
                query = query.eq("dot_number", dot_number)
            if mc_number:
                query = query.eq("mc_number", mc_number)

            result = query.gte("expires_at", datetime.now(timezone.utc).isoformat()).maybe_single().execute()
            if result and result.data:
                return result.data["response_json"]
        except Exception:
            logger.warning("FMCSA cache read failed, falling through to API")
        return None

    def _set_cached(
        self,
        lookup_type: str,
        data: dict,
        *,
        dot_number: str | None = None,
        mc_number: str | None = None,
        http_status: int = 200,
    ) -> None:
        try:
            sb = get_supabase()
            now = datetime.now(timezone.utc)
            row = {
                "lookup_type": lookup_type,
                "dot_number": dot_number,
                "mc_number": mc_number,
                "response_json": data,
                "http_status_code": http_status,
                "cached_at": now.isoformat(),
                "expires_at": (now + timedelta(hours=24)).isoformat(),
            }
            sb.table("fmcsa_cache").upsert(row, on_conflict="lookup_type,coalesce(dot_number,mc_number)").execute()
        except Exception:
            logger.warning("FMCSA cache write failed, result not cached")
