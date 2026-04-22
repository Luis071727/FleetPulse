import logging
from datetime import date, datetime, timezone
from uuid import uuid4

from app.config import get_supabase, settings

logger = logging.getLogger(__name__)

VALID_DOC_TYPES = {
    "MC_AUTHORITY", "W9", "VOID_CHECK", "CARRIER_AGREEMENT",
    "NOA", "COI", "CDL", "OTHER",
}
STORAGE_BUCKET = "carrier-documents"

EXPIRING_SOON_WINDOW_DAYS = 30


# ── Central Status Engine ─────────────────────────────────────────────────────

def evaluate_document_status(doc: dict) -> str:
    """Return 'active' | 'expiring_soon' | 'expired' for a compliance doc.

    expires_at is canonical. Missing expiry → 'active' (we can't evaluate it).
    """
    expires_at = doc.get("expires_at")
    if not expires_at:
        return "active"
    try:
        exp = _parse_date(expires_at)
    except (ValueError, TypeError):
        return "active"

    today = date.today()
    if exp < today:
        return "expired"
    if (exp - today).days <= EXPIRING_SOON_WINDOW_DAYS:
        return "expiring_soon"
    return "active"


def _parse_date(value: str) -> date:
    # handles both "YYYY-MM-DD" and full ISO timestamps
    if len(value) >= 10:
        return date.fromisoformat(value[:10])
    raise ValueError(f"Cannot parse date: {value!r}")


class CarrierComplianceService:

    def create_request(
        self,
        carrier_id: str,
        org_id: str,
        doc_types: list[str],
        notes: str | None,
        recipient_email: str | None,
    ) -> dict:
        sb = get_supabase()
        token = str(uuid4())
        row = {
            "id": str(uuid4()),
            "token": token,
            "organization_id": org_id,
            "carrier_id": carrier_id,
            "doc_types": doc_types,
            "notes": notes,
            "recipient_email": recipient_email,
            "status": "pending",
        }
        try:
            result = sb.table("carrier_document_requests").insert(row).execute()
            record = result.data[0] if result.data else row
        except Exception as exc:
            logger.error("Failed to persist carrier doc request: %s", exc)
            raise RuntimeError(f"Could not save carrier document request: {exc}") from exc

        dispatcher_url = getattr(settings, "dispatcher_url", "http://localhost:3001").rstrip("/")
        record["magic_link"] = f"{dispatcher_url}/carrier-upload/{record.get('token', token)}"
        return record

    def get_request_by_token(self, token: str) -> dict | None:
        sb = get_supabase()
        try:
            result = (
                sb.table("carrier_document_requests")
                .select("*")
                .eq("token", token)
                .maybe_single()
                .execute()
            )
            req = result.data if result else None
        except Exception:
            logger.debug("Carrier doc token lookup failed")
            return None

        if not req:
            return None

        expires_at = req.get("expires_at")
        if expires_at:
            try:
                exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if exp < datetime.now(timezone.utc):
                    try:
                        sb.table("carrier_document_requests").update({"status": "expired"}).eq("id", req["id"]).execute()
                    except Exception:
                        pass
                    req["status"] = "expired"
                    return req
            except (ValueError, TypeError):
                pass

        try:
            carrier_result = (
                sb.table("carriers")
                .select("legal_name, mc_number, dot_number")
                .eq("id", req["carrier_id"])
                .maybe_single()
                .execute()
            )
            if carrier_result and carrier_result.data:
                c = carrier_result.data
                req["carrier_name"] = c.get("legal_name") or "—"
                req["carrier_mc"] = c.get("mc_number")
                req["carrier_dot"] = c.get("dot_number")
        except Exception:
            req["carrier_name"] = "—"

        return req

    def upload_file(
        self,
        token: str,
        doc_type: str,
        filename: str,
        file_bytes: bytes,
        content_type: str,
        issue_date: str | None = None,
        expires_at: str | None = None,
    ) -> dict:
        req = self.get_request_by_token(token)
        if not req:
            raise ValueError("Invalid or expired upload token")
        if req.get("status") in ("expired", "fulfilled"):
            raise ValueError(f"Upload link is {req.get('status')}")

        sb = get_supabase()
        request_id = req["id"]
        carrier_id = req["carrier_id"]
        org_id = req["organization_id"]

        doc = self._store_document(
            sb=sb,
            carrier_id=carrier_id,
            org_id=org_id,
            doc_type=doc_type,
            filename=filename,
            file_bytes=file_bytes,
            content_type=content_type,
            issue_date=issue_date,
            expires_at=expires_at,
            request_id=request_id,
            storage_prefix=f"{org_id}/{carrier_id}/{request_id}",
        )

        self._maybe_fulfill_request(req, sb)
        self.sync_pending_actions(carrier_id, org_id)
        return doc

    def upload_file_direct(
        self,
        carrier_id: str,
        org_id: str,
        doc_type: str,
        filename: str,
        file_bytes: bytes,
        content_type: str,
        issue_date: str | None = None,
        expires_at: str | None = None,
    ) -> dict:
        """Direct dispatcher upload — no magic-link token required."""
        sb = get_supabase()
        doc = self._store_document(
            sb=sb,
            carrier_id=carrier_id,
            org_id=org_id,
            doc_type=doc_type,
            filename=filename,
            file_bytes=file_bytes,
            content_type=content_type,
            issue_date=issue_date,
            expires_at=expires_at,
            request_id=None,
            storage_prefix=f"{org_id}/{carrier_id}/direct",
        )
        self.sync_pending_actions(carrier_id, org_id)
        return doc

    def renew_document(
        self,
        carrier_id: str,
        org_id: str,
        doc_type: str,
        filename: str,
        file_bytes: bytes,
        content_type: str,
        issue_date: str,
        expires_at: str,
    ) -> dict:
        """Replace any active/expired document of the same type and insert a
        fresh one. Callers (dispatcher direct upload, carrier portal renew) both
        flow through here so the lifecycle is identical.
        """
        if not issue_date or not expires_at:
            raise ValueError("Issue date and expiration date are required for renewal")
        if doc_type not in VALID_DOC_TYPES:
            raise ValueError(f"Invalid doc_type: {doc_type}")

        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Mark any prior active doc of this type as superseded so sync
        # recomputes status from the newest record.
        try:
            sb.table("compliance_documents").update({
                "is_active": False,
                "superseded_at": now_iso,
            }).eq("carrier_id", carrier_id).eq("doc_type", doc_type).eq("is_active", True).execute()
        except Exception as exc:
            logger.warning("Could not mark prior %s docs as superseded for carrier %s: %s", doc_type, carrier_id, exc)

        doc = self._store_document(
            sb=sb,
            carrier_id=carrier_id,
            org_id=org_id,
            doc_type=doc_type,
            filename=filename,
            file_bytes=file_bytes,
            content_type=content_type,
            issue_date=issue_date,
            expires_at=expires_at,
            request_id=None,
            storage_prefix=f"{org_id}/{carrier_id}/renewals",
        )
        self.sync_pending_actions(carrier_id, org_id)
        return doc

    def list_documents(self, carrier_id: str, org_id: str) -> dict:
        sb = get_supabase()
        documents: list[dict] = []
        requests: list[dict] = []

        try:
            doc_result = (
                sb.table("compliance_documents")
                .select("*")
                .eq("carrier_id", carrier_id)
                .eq("organization_id", org_id)
                .order("uploaded_at", desc=False)
                .execute()
            )
            raw_docs = doc_result.data or []
            for doc in raw_docs:
                # Computed status, doesn't require DB writes on read.
                doc["effective_status"] = evaluate_document_status(doc)
                path = doc.get("file_url", "")
                if path and not path.startswith("http"):
                    try:
                        signed = sb.storage.from_(STORAGE_BUCKET).create_signed_url(path, 3600)
                        doc["file_url"] = signed.get("signedURL") or signed.get("signedUrl") or path
                    except Exception as exc:
                        logger.warning("Could not sign URL for %s: %s", path, exc)
            documents = raw_docs
        except Exception:
            logger.debug("DB list compliance_documents failed")

        try:
            req_result = (
                sb.table("carrier_document_requests")
                .select("*")
                .eq("carrier_id", carrier_id)
                .eq("organization_id", org_id)
                .order("created_at", desc=True)
                .execute()
            )
            raw_requests = req_result.data or []
            dispatcher_url = getattr(settings, "dispatcher_url", "http://localhost:3001").rstrip("/")
            for r in raw_requests:
                r["magic_link"] = f"{dispatcher_url}/carrier-upload/{r['token']}"
            requests = raw_requests
        except Exception:
            logger.debug("DB list carrier_document_requests failed")

        return {"documents": documents, "requests": requests}

    def update_document(self, doc_id: str, carrier_id: str, org_id: str, updates: dict) -> dict | None:
        allowed = {"doc_type", "issue_date", "expires_at"}
        payload = {k: v for k, v in updates.items() if k in allowed}
        if not payload:
            return None
        if "doc_type" in payload and payload["doc_type"] not in VALID_DOC_TYPES:
            raise ValueError(f"Invalid doc_type: {payload['doc_type']}")
        sb = get_supabase()
        try:
            result = (
                sb.table("compliance_documents")
                .update(payload)
                .eq("id", doc_id)
                .eq("carrier_id", carrier_id)
                .execute()
            )
            doc = result.data[0] if result.data else None
        except Exception as exc:
            logger.error("Failed to update compliance document %s: %s", doc_id, exc)
            return None
        if doc is not None:
            self.sync_pending_actions(carrier_id, org_id)
        return doc

    def delete_document(self, doc_id: str, carrier_id: str, org_id: str) -> bool:
        sb = get_supabase()
        try:
            result = (
                sb.table("compliance_documents")
                .delete()
                .eq("id", doc_id)
                .eq("carrier_id", carrier_id)
                .execute()
            )
            deleted = bool(result.data)
        except Exception as exc:
            logger.error("Failed to delete compliance document %s: %s", doc_id, exc)
            return False
        if deleted:
            self.sync_pending_actions(carrier_id, org_id)
        return deleted

    # ── Pending Actions (derived state) ───────────────────────────────────────

    def sync_pending_actions(self, carrier_id: str, org_id: str | None = None) -> list[dict]:
        """Rebuild the pending-action rows for a carrier from their active
        compliance documents. Called after any mutation (upload / renew /
        update / delete). Safe to call repeatedly — it clears and reinserts.
        """
        sb = get_supabase()
        try:
            docs_result = (
                sb.table("compliance_documents")
                .select("*")
                .eq("carrier_id", carrier_id)
                .execute()
            )
            raw_docs = docs_result.data or []
        except Exception as exc:
            logger.debug("sync_pending_actions: doc fetch failed for carrier %s: %s", carrier_id, exc)
            return []

        # Newest active doc per type wins. If no active doc, fall back to the
        # newest record so we still evaluate expiry.
        by_type: dict[str, dict] = {}
        for doc in raw_docs:
            dt = doc.get("doc_type")
            if not dt:
                continue
            is_active = doc.get("is_active", True)
            uploaded = doc.get("uploaded_at") or doc.get("created_at") or ""
            existing = by_type.get(dt)
            # Prefer active docs; within the same active-ness, prefer newest.
            if existing is None:
                by_type[dt] = doc
                continue
            existing_active = existing.get("is_active", True)
            if is_active and not existing_active:
                by_type[dt] = doc
            elif is_active == existing_active:
                if (uploaded or "") > (existing.get("uploaded_at") or existing.get("created_at") or ""):
                    by_type[dt] = doc

        resolved_org = org_id
        today = date.today()
        actions: list[dict] = []
        for dt, doc in by_type.items():
            status = evaluate_document_status(doc)
            if status == "active":
                continue
            expires_raw = doc.get("expires_at")
            days_remaining: int | None = None
            if expires_raw:
                try:
                    days_remaining = (_parse_date(expires_raw) - today).days
                except (ValueError, TypeError):
                    days_remaining = None
            actions.append({
                "organization_id": resolved_org or doc.get("organization_id"),
                "carrier_id": carrier_id,
                "doc_id": doc.get("id"),
                "doc_type": dt,
                "kind": status,
                "expires_at": expires_raw[:10] if expires_raw else None,
                "days_remaining": days_remaining,
            })

        # Replace existing rows for this carrier with the freshly-computed set.
        try:
            sb.table("compliance_pending_actions").delete().eq("carrier_id", carrier_id).execute()
        except Exception as exc:
            logger.debug("Could not clear pending actions for carrier %s: %s", carrier_id, exc)

        if not actions:
            return []

        try:
            sb.table("compliance_pending_actions").insert(actions).execute()
        except Exception as exc:
            logger.debug("Could not insert pending actions for carrier %s: %s", carrier_id, exc)

        return actions

    def list_pending_actions(self, carrier_id: str) -> list[dict]:
        """Read cached pending actions; if the cache is empty or unavailable,
        compute them on the fly from the documents. This makes the dashboard
        resilient even when the pending-actions table is missing.
        """
        sb = get_supabase()
        try:
            result = (
                sb.table("compliance_pending_actions")
                .select("*")
                .eq("carrier_id", carrier_id)
                .order("days_remaining", desc=False)
                .execute()
            )
            rows = result.data or []
            if rows:
                return rows
        except Exception:
            logger.debug("pending_actions read failed — falling back to live compute")

        # Fallback: compute without persisting.
        try:
            docs_result = (
                sb.table("compliance_documents")
                .select("*")
                .eq("carrier_id", carrier_id)
                .execute()
            )
            raw_docs = docs_result.data or []
        except Exception:
            return []

        today = date.today()
        by_type: dict[str, dict] = {}
        for doc in raw_docs:
            dt = doc.get("doc_type")
            if not dt:
                continue
            existing = by_type.get(dt)
            if existing is None or (doc.get("uploaded_at") or "") > (existing.get("uploaded_at") or ""):
                by_type[dt] = doc

        actions: list[dict] = []
        for dt, doc in by_type.items():
            status = evaluate_document_status(doc)
            if status == "active":
                continue
            expires_raw = doc.get("expires_at")
            days_remaining: int | None = None
            if expires_raw:
                try:
                    days_remaining = (_parse_date(expires_raw) - today).days
                except (ValueError, TypeError):
                    days_remaining = None
            actions.append({
                "carrier_id": carrier_id,
                "doc_id": doc.get("id"),
                "doc_type": dt,
                "kind": status,
                "expires_at": expires_raw[:10] if expires_raw else None,
                "days_remaining": days_remaining,
            })
        return actions

    # ── private ───────────────────────────────────────────────────────────────

    def _store_document(
        self,
        *,
        sb,
        carrier_id: str,
        org_id: str,
        doc_type: str,
        filename: str,
        file_bytes: bytes,
        content_type: str,
        issue_date: str | None,
        expires_at: str | None,
        request_id: str | None,
        storage_prefix: str,
    ) -> dict:
        safe_name = filename.replace("/", "_").replace("..", "_")
        storage_path = f"{storage_prefix}/{safe_name}"

        try:
            sb.storage.from_(STORAGE_BUCKET).upload(
                storage_path,
                file_bytes,
                file_options={"content-type": content_type, "upsert": "true"},
            )
        except Exception as exc:
            logger.error("Storage upload failed: %s", exc)
            raise RuntimeError(f"File upload to storage failed: {exc}") from exc

        doc_row: dict = {
            "id": str(uuid4()),
            "organization_id": org_id,
            "carrier_id": carrier_id,
            "doc_type": doc_type,
            "file_name": safe_name,
            "file_url": storage_path,
            "file_size": len(file_bytes),
            "status": "active",
            "is_active": True,
        }
        if request_id:
            doc_row["request_id"] = request_id
        if issue_date:
            doc_row["issue_date"] = issue_date
            # Mirror into issued_at so the carrier portal (reads Supabase
            # directly via the `issued_at` column) sees the value immediately.
            doc_row["issued_at"] = issue_date
        if expires_at:
            doc_row["expires_at"] = expires_at

        try:
            result = sb.table("compliance_documents").insert(doc_row).execute()
            return result.data[0] if result.data else doc_row
        except Exception as exc:
            logger.error("Failed to persist compliance_documents record: %s", exc)
            raise RuntimeError(f"Could not save document record: {exc}") from exc

    def _maybe_fulfill_request(self, req: dict, sb) -> None:
        requested_types = set(req.get("doc_types") or [])
        if not requested_types:
            return
        try:
            uploaded = (
                sb.table("compliance_documents")
                .select("doc_type")
                .eq("request_id", req["id"])
                .execute()
            )
            uploaded_types = {row["doc_type"] for row in (uploaded.data or [])}
            if requested_types.issubset(uploaded_types):
                sb.table("carrier_document_requests").update({
                    "status": "fulfilled",
                    "fulfilled_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", req["id"]).execute()
        except Exception:
            pass  # Non-critical
