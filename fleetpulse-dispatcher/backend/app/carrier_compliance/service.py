import logging
from datetime import datetime, timezone
from uuid import uuid4

from app.config import get_supabase, settings

logger = logging.getLogger(__name__)

VALID_DOC_TYPES = {
    "MC_AUTHORITY", "W9", "VOID_CHECK", "CARRIER_AGREEMENT",
    "NOA", "COI", "CDL", "OTHER",
}
STORAGE_BUCKET = "carrier-documents"


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

        # Check expiry
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

        # Enrich with carrier name
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

        safe_name = filename.replace("/", "_").replace("..", "_")
        storage_path = f"{org_id}/{carrier_id}/{request_id}/{safe_name}"

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
            "request_id": request_id,
            "doc_type": doc_type,
            "file_name": safe_name,
            "file_url": storage_path,
            "file_size": len(file_bytes),
            "status": "active",
        }
        if issue_date:
            doc_row["issue_date"] = issue_date
        if expires_at:
            doc_row["expires_at"] = expires_at

        try:
            result = sb.table("compliance_documents").insert(doc_row).execute()
            doc = result.data[0] if result.data else doc_row
        except Exception as exc:
            logger.error("Failed to persist compliance_documents record: %s", exc)
            raise RuntimeError(f"Could not save document record: {exc}") from exc

        self._maybe_fulfill_request(req, sb)
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

        safe_name = filename.replace("/", "_").replace("..", "_")
        storage_path = f"{org_id}/{carrier_id}/direct/{safe_name}"

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
        }
        if issue_date:
            doc_row["issue_date"] = issue_date
        if expires_at:
            doc_row["expires_at"] = expires_at

        try:
            result = sb.table("compliance_documents").insert(doc_row).execute()
            doc = result.data[0] if result.data else doc_row
        except Exception as exc:
            logger.error("Failed to persist compliance_documents record: %s", exc)
            raise RuntimeError(f"Could not save document record: {exc}") from exc

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

    # ── private ───────────────────────────────────────────────────────────────

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
