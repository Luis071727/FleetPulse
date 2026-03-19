import logging
from datetime import datetime, timezone

from app.config import get_supabase, safe_execute
from app.fmcsa.cache import FmcsaCacheService
from app.fmcsa.client import FmcsaError

logger = logging.getLogger(__name__)

# In-memory carrier store — used when Supabase RLS blocks table access
_CARRIERS: list[dict] = []


class CarrierService:
    def __init__(self) -> None:
        self._cache = FmcsaCacheService()

    def list_carriers(
        self,
        org_id: str,
        *,
        search: str | None = None,
        status: str | None = None,
        sort_by: str = "legal_name",
        order: str = "asc",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        try:
            sb = get_supabase()
            query = sb.table("carriers").select("*", count="exact").eq("organization_id", org_id).is_("deleted_at", "null")
            if status:
                query = query.eq("status", status)
            if search:
                query = query.or_(
                    f"legal_name.ilike.%{search}%,dot_number.ilike.%{search}%,mc_number.ilike.%{search}%"
                )
            query = query.order(sort_by, desc=(order == "desc")).range(offset, offset + limit - 1)
            result = query.execute()
            total = result.count if result.count is not None else len(result.data)
            return result.data or [], total
        except Exception:
            logger.debug("DB list_carriers failed, using in-memory store")
            rows = [c for c in _CARRIERS if c.get("organization_id") == org_id and not c.get("deleted_at")]
            if status:
                rows = [c for c in rows if c.get("status") == status]
            if search:
                s = search.lower()
                rows = [c for c in rows if s in (c.get("legal_name") or "").lower() or s in (c.get("dot_number") or "")]
            return rows[offset:offset + limit], len(rows)

    def get_carrier(self, org_id: str, carrier_id: str) -> dict | None:
        try:
            sb = get_supabase()
            result = (
                sb.table("carriers")
                .select("*")
                .eq("id", carrier_id)
                .eq("organization_id", org_id)
                .is_("deleted_at", "null")
                .maybe_single()
                .execute()
            )
            return result.data if result else None
        except Exception:
            return next((c for c in _CARRIERS if c.get("id") == carrier_id and c.get("organization_id") == org_id), None)

    def create_from_dot(self, org_id: str, dot_number: str, notes: str | None = None) -> dict:
        # Check in-memory duplicates
        for c in _CARRIERS:
            if c.get("organization_id") == org_id and c.get("dot_number") == dot_number and not c.get("deleted_at"):
                raise ValueError(f"DOT {dot_number} already in roster")

        # Check DB duplicate (best-effort)
        try:
            sb = get_supabase()
            existing = (
                sb.table("carriers")
                .select("id")
                .eq("organization_id", org_id)
                .eq("dot_number", dot_number)
                .is_("deleted_at", "null")
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                raise ValueError(f"DOT {dot_number} already in roster")
        except ValueError:
            raise
        except Exception:
            pass

        # Fetch from FMCSA (with cache)
        try:
            result, cached = self._cache.get_or_fetch_carrier(dot_number)
        except FmcsaError as e:
            raise RuntimeError(e.message) from e

        if not result.found:
            raise LookupError("DOT# not found in FMCSA database")

        fmcsa = result.data
        from uuid import uuid4
        row = {
            "id": str(uuid4()),
            "organization_id": org_id,
            "dot_number": dot_number,
            "mc_number": fmcsa.get("mc_number"),
            "legal_name": fmcsa.get("legal_name", "Unknown"),
            "dba_name": fmcsa.get("dba_name"),
            "fmcsa_safety_rating": fmcsa.get("fmcsa_safety_rating"),
            "power_units": fmcsa.get("power_units"),
            "drivers": fmcsa.get("drivers"),
            "authority_status": fmcsa.get("authority_status"),
            "operating_status": fmcsa.get("operating_status"),
            "phone": fmcsa.get("phone"),
            "email": fmcsa.get("email"),
            "owner_name": fmcsa.get("owner_name"),
            "whatsapp": fmcsa.get("whatsapp"),
            "address": fmcsa.get("physical_address"),
            "mailing_address": fmcsa.get("mailing_address"),
            "status": "new",
            "verification_status": "verified",
            "portal_status": "not_invited",
            "notes": notes,
        }

        # DB write
        try:
            sb = get_supabase()
            insert_result = sb.table("carriers").insert(row).execute()
            carrier = insert_result.data[0] if insert_result.data else row
            logger.info("Carrier (DOT) inserted into DB: %s", carrier.get("id"))
        except Exception as exc:
            logger.error("Carrier (DOT) DB insert failed: %s", exc)
            carrier = row

        # Always store in memory
        _CARRIERS.append(carrier)
        carrier["_cached"] = cached
        return carrier

    def update_carrier(self, org_id: str, carrier_id: str, updates: dict) -> dict | None:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()

        try:
            sb = get_supabase()
            result = safe_execute(
                sb.table("carriers")
                .update(updates)
                .eq("id", carrier_id)
                .eq("organization_id", org_id)
            )
            if result.data:
                # Also update in-memory
                for c in _CARRIERS:
                    if c.get("id") == carrier_id:
                        c.update(updates)
                return result.data[0]
        except Exception:
            pass

        # Fallback: update in-memory
        for c in _CARRIERS:
            if c.get("id") == carrier_id and c.get("organization_id") == org_id:
                c.update(updates)
                return c
        return None

    def create_manual(self, org_id: str, data: dict) -> dict:
        """Create a carrier from manual entry (no FMCSA lookup). Marked as 'unverified'."""
        dot_number = data.get("dot_number")

        # DOT uniqueness check (if a DOT was provided)
        if dot_number:
            for c in _CARRIERS:
                if c.get("organization_id") == org_id and c.get("dot_number") == dot_number and not c.get("deleted_at"):
                    raise ValueError(c.get("id", ""))

            try:
                sb = get_supabase()
                existing = (
                    sb.table("carriers")
                    .select("id")
                    .eq("organization_id", org_id)
                    .eq("dot_number", dot_number)
                    .is_("deleted_at", "null")
                    .maybe_single()
                    .execute()
                )
                if existing and existing.data:
                    raise ValueError(existing.data["id"])
            except ValueError:
                raise
            except Exception:
                pass

        from uuid import uuid4
        row = {
            "id": str(uuid4()),
            "organization_id": org_id,
            "dot_number": dot_number or None,
            "mc_number": data.get("mc_number"),
            "legal_name": data.get("legal_name", "Unknown"),
            "address": data.get("address"),
            "phone": data.get("phone"),
            "power_units": data.get("power_units"),
            "status": "new",
            "verification_status": "unverified",
            "portal_status": "not_invited",
            "notes": data.get("notes"),
        }

        try:
            sb = get_supabase()
            insert_result = sb.table("carriers").insert(row).execute()
            carrier = insert_result.data[0] if insert_result.data else row
            logger.info("Carrier (manual) inserted into DB: %s", carrier.get("id"))
        except Exception as exc:
            logger.error("Carrier (manual) DB insert failed: %s", exc)
            carrier = row

        _CARRIERS.append(carrier)
        return carrier

    def soft_delete(self, org_id: str, carrier_id: str) -> bool:
        sb = get_supabase()
        result = safe_execute(
            sb.table("carriers")
            .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", carrier_id)
            .eq("organization_id", org_id)
        )
        return bool(result.data)

    @staticmethod
    def compute_status(carrier_id: str, org_id: str) -> str:
        """Recompute carrier status from load/invoice/compliance data (FR-009a)."""
        sb = get_supabase()
        now = datetime.now(timezone.utc)

        # Check for recent loads (Active: load within 30 days)
        from datetime import timedelta
        thirty_days_ago = (now - timedelta(days=30)).isoformat()
        recent_loads = (
            sb.table("loads")
            .select("id", count="exact")
            .eq("carrier_id", carrier_id)
            .eq("organization_id", org_id)
            .gte("created_at", thirty_days_ago)
            .is_("deleted_at", "null")
            .execute()
        )
        has_recent_load = (recent_loads.count or 0) > 0

        # Check for overdue invoices (Issues: 30+ days outstanding from issued_date)
        thirty_days_ago_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        overdue_invoices = (
            sb.table("invoices")
            .select("id", count="exact")
            .eq("carrier_id", carrier_id)
            .neq("status", "paid")
            .lte("issued_date", thirty_days_ago_date)
            .is_("deleted_at", "null")
            .execute()
        )
        has_overdue = (overdue_invoices.count or 0) > 0

        if has_overdue:
            return "issues"
        if has_recent_load:
            return "active"

        # Check for idle (no load in 60+ days)
        sixty_days_ago = (now - timedelta(days=60)).isoformat()
        any_loads = (
            sb.table("loads")
            .select("id", count="exact")
            .eq("carrier_id", carrier_id)
            .eq("organization_id", org_id)
            .gte("created_at", sixty_days_ago)
            .is_("deleted_at", "null")
            .execute()
        )
        if (any_loads.count or 0) == 0:
            return "idle"

        return "active"
