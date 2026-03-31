import logging
from datetime import datetime, timezone
from uuid import uuid4

from app.config import get_supabase, safe_execute, settings

logger = logging.getLogger(__name__)

VALID_DOC_TYPES = {"BOL", "POD", "RATE_CON", "WEIGHT_TICKET", "LUMPER_RECEIPT", "INVOICE", "OTHER"}
STORAGE_BUCKET = "invoice-documents"


class PaperworkService:

    def create_request(
        self,
        invoice_id: str,
        org_id: str,
        doc_types: list[str],
        notes: str | None,
        recipient_email: str | None,
    ) -> dict:
        sb = get_supabase()
        # Generate token explicitly so the magic link is correct even if the DB
        # insert fails and we fall back to the in-memory row (DB default wouldn't fire).
        token = str(uuid4())
        row = {
            "id": str(uuid4()),
            "token": token,
            "organization_id": org_id,
            "invoice_id": invoice_id,
            "doc_types": doc_types,
            "notes": notes,
            "recipient_email": recipient_email,
            "status": "pending",
        }
        try:
            result = sb.table("invoice_document_requests").insert(row).execute()
            record = result.data[0] if result.data else row
        except Exception as exc:
            logger.error("Failed to persist paperwork request to DB: %s", exc)
            raise RuntimeError(f"Could not save paperwork request: {exc}") from exc

        dispatcher_url = getattr(settings, "dispatcher_url", "http://localhost:3001").rstrip("/")
        record["magic_link"] = f"{dispatcher_url}/upload/{record.get('token', token)}"
        return record

    def get_request_by_token(self, token: str) -> dict | None:
        sb = get_supabase()
        try:
            result = (
                sb.table("invoice_document_requests")
                .select("*")
                .eq("token", token)
                .maybe_single()
                .execute()
            )
            req = result.data if result else None
        except Exception:
            logger.debug("DB token lookup failed")
            return None

        if not req:
            return None

        # Check expiry
        expires_at = req.get("expires_at")
        if expires_at:
            try:
                exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if exp < datetime.now(timezone.utc):
                    # Mark expired in DB (best-effort)
                    try:
                        sb.table("invoice_document_requests").update({"status": "expired"}).eq("id", req["id"]).execute()
                    except Exception:
                        pass
                    req["status"] = "expired"
                    return req
            except (ValueError, TypeError):
                pass

        # Enrich with invoice summary
        try:
            inv_result = (
                sb.table("invoices")
                .select("invoice_number, amount, carrier_name, carrier_id, load_id")
                .eq("id", req["invoice_id"])
                .maybe_single()
                .execute()
            )
            if inv_result and inv_result.data:
                inv = inv_result.data
                req["invoice_number"] = inv.get("invoice_number") or req["invoice_id"][:8]
                req["invoice_amount"] = inv.get("amount")
                req["carrier_name"] = inv.get("carrier_name") or "—"
        except Exception:
            req["invoice_number"] = req["invoice_id"][:8]

        return req

    def upload_file(
        self,
        token: str,
        doc_type: str,
        filename: str,
        file_bytes: bytes,
        content_type: str,
    ) -> dict:
        req = self.get_request_by_token(token)
        if not req:
            raise ValueError("Invalid or expired upload token")
        if req.get("status") in ("expired", "fulfilled"):
            raise ValueError(f"Upload link is {req.get('status')}")

        sb = get_supabase()
        request_id = req["id"]
        invoice_id = req["invoice_id"]
        org_id = req["organization_id"]

        # Sanitize filename
        safe_name = filename.replace("/", "_").replace("..", "_")
        storage_path = f"{org_id}/{invoice_id}/{request_id}/{safe_name}"

        # Upload to Supabase Storage — store the path, not a public URL.
        # Public URLs don't work for private buckets; signed URLs are generated
        # at read time in list_documents().
        try:
            sb.storage.from_(STORAGE_BUCKET).upload(
                storage_path,
                file_bytes,
                file_options={"content-type": content_type, "upsert": "true"},
            )
            file_url = storage_path  # store path; signed URL generated on read
        except Exception as exc:
            logger.error("Storage upload failed: %s", exc)
            raise RuntimeError(f"File upload to storage failed: {exc}") from exc

        # Record in DB
        doc_row = {
            "id": str(uuid4()),
            "organization_id": org_id,
            "invoice_id": invoice_id,
            "request_id": request_id,
            "doc_type": doc_type,
            "file_name": safe_name,
            "file_url": file_url,
            "file_size": len(file_bytes),
        }
        try:
            result = sb.table("invoice_documents").insert(doc_row).execute()
            doc = result.data[0] if result.data else doc_row
        except Exception as exc:
            logger.error("Failed to persist invoice_documents record: %s", exc)
            raise RuntimeError(f"Could not save document record: {exc}") from exc

        # Check if all requested doc_types are now fulfilled
        self._maybe_fulfill_request(req, sb)

        return doc

    def list_documents(self, invoice_id: str, org_id: str) -> dict:
        sb = get_supabase()
        documents: list[dict] = []
        requests: list[dict] = []

        try:
            doc_result = (
                sb.table("invoice_documents")
                .select("*")
                .eq("invoice_id", invoice_id)
                .eq("organization_id", org_id)
                .order("uploaded_at", desc=False)
                .execute()
            )
            raw_docs = doc_result.data or []
            # Generate a signed URL (1 h) for each document so the dispatcher
            # can view/download files from a private bucket.
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
            logger.debug("DB list invoice_documents failed")

        try:
            req_result = (
                sb.table("invoice_document_requests")
                .select("*")
                .eq("invoice_id", invoice_id)
                .eq("organization_id", org_id)
                .order("created_at", desc=True)
                .execute()
            )
            raw_requests = req_result.data or []
            dispatcher_url = getattr(settings, "dispatcher_url", "http://localhost:3001")
            for r in raw_requests:
                r["magic_link"] = f"{dispatcher_url}/upload/{r['token']}"
            requests = raw_requests
        except Exception:
            logger.debug("DB list invoice_document_requests failed")

        return {"documents": documents, "requests": requests}

    def upload_file_direct(
        self,
        invoice_id: str,
        org_id: str,
        doc_type: str,
        filename: str,
        file_bytes: bytes,
        content_type: str,
    ) -> dict:
        """Direct dispatcher upload — no magic-link token required."""
        sb = get_supabase()

        safe_name = filename.replace("/", "_").replace("..", "_")
        storage_path = f"{org_id}/{invoice_id}/direct/{safe_name}"

        try:
            sb.storage.from_(STORAGE_BUCKET).upload(
                storage_path,
                file_bytes,
                file_options={"content-type": content_type, "upsert": "true"},
            )
        except Exception as exc:
            logger.error("Storage upload failed: %s", exc)
            raise RuntimeError(f"File upload to storage failed: {exc}") from exc

        doc_row = {
            "id": str(uuid4()),
            "organization_id": org_id,
            "invoice_id": invoice_id,
            "doc_type": doc_type,
            "file_name": safe_name,
            "file_url": storage_path,
            "file_size": len(file_bytes),
        }
        try:
            result = sb.table("invoice_documents").insert(doc_row).execute()
            doc = result.data[0] if result.data else doc_row
        except Exception as exc:
            logger.error("Failed to persist invoice_documents record: %s", exc)
            raise RuntimeError(f"Could not save document record: {exc}") from exc

        return doc

    def delete_document(self, doc_id: str, invoice_id: str, org_id: str) -> bool:
        sb = get_supabase()
        try:
            result = (
                sb.table("invoice_documents")
                .delete()
                .eq("id", doc_id)
                .eq("invoice_id", invoice_id)
                .eq("organization_id", org_id)
                .execute()
            )
            return bool(result.data)
        except Exception as exc:
            logger.error("Failed to delete invoice document %s: %s", doc_id, exc)
            return False

    def update_document(self, doc_id: str, invoice_id: str, org_id: str, updates: dict) -> dict | None:
        sb = get_supabase()
        allowed = {"doc_type", "issued_at", "expires_at"}
        payload = {k: v for k, v in updates.items() if k in allowed}
        if not payload:
            return None
        if "doc_type" in payload and payload["doc_type"] not in VALID_DOC_TYPES:
            raise ValueError(f"Invalid doc_type: {payload['doc_type']}")
        try:
            result = (
                sb.table("invoice_documents")
                .update(payload)
                .eq("id", doc_id)
                .eq("invoice_id", invoice_id)
                .eq("organization_id", org_id)
                .execute()
            )
            return result.data[0] if result.data else None
        except Exception as exc:
            logger.error("Failed to update invoice document %s: %s", doc_id, exc)
            return None

    # ── private ───────────────────────────────────────────────────────────────

    def _maybe_fulfill_request(self, req: dict, sb) -> None:
        requested_types = set(req.get("doc_types") or [])
        if not requested_types:
            return
        try:
            uploaded = (
                sb.table("invoice_documents")
                .select("doc_type")
                .eq("request_id", req["id"])
                .execute()
            )
            uploaded_types = {row["doc_type"] for row in (uploaded.data or [])}
            if requested_types.issubset(uploaded_types):
                sb.table("invoice_document_requests").update({
                    "status": "fulfilled",
                    "fulfilled_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", req["id"]).execute()
        except Exception:
            pass  # Non-critical
