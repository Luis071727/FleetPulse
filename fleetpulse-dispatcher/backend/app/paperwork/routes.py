import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel as _BaseModel
from pydantic import BaseModel

from app.common.schemas import ResponseEnvelope, ok
from app.middleware.auth import CurrentUser, require_authenticated, require_dispatcher
from app.paperwork.service import VALID_DOC_TYPES, PaperworkService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/paperwork", tags=["paperwork"])
_service = PaperworkService()

MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB


class CreateRequestIn(BaseModel):
    invoice_id: str
    doc_types: list[str]
    notes: str | None = None
    recipient_email: str | None = None


class UpdateDocumentIn(_BaseModel):
    doc_type: str | None = None
    issued_at: str | None = None
    expires_at: str | None = None


# ── POST /paperwork/requests ── (any authenticated user) ──────────────────────

@router.post("/requests", status_code=201)
def create_paperwork_request(
    payload: CreateRequestIn,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    # Validate doc types
    invalid = [d for d in payload.doc_types if d not in VALID_DOC_TYPES]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid doc_type(s): {', '.join(invalid)}. Valid: {', '.join(sorted(VALID_DOC_TYPES))}",
        )
    if not payload.doc_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one doc_type required")

    # Dispatchers have org_id on their user row; carriers don't — inherit it from the invoice.
    from app.config import get_supabase as _get_sb
    org_id = user.organization_id
    if not org_id:
        try:
            inv = _get_sb().table("invoices").select("organization_id").eq("id", payload.invoice_id).maybe_single().execute()
            org_id = (inv.data or {}).get("organization_id") if inv else None
        except Exception:
            pass
        if not org_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not resolve organization for this invoice")

    try:
        record = _service.create_request(
            invoice_id=payload.invoice_id,
            org_id=org_id,
            doc_types=payload.doc_types,
            notes=payload.notes,
            recipient_email=payload.recipient_email,
        )
    except Exception as exc:
        logger.exception("Failed to create paperwork request")
        raise HTTPException(status_code=500, detail=str(exc))

    return ok({
        "request_id": record.get("id"),
        "magic_link": record.get("magic_link"),
        "token": str(record.get("token", "")),
        "expires_at": record.get("expires_at"),
        "doc_types": record.get("doc_types"),
        "notes": record.get("notes"),
        "status": record.get("status"),
    })


# ── GET /paperwork/carrier/pending ── (carrier: all pending requests) ─────────

@router.get("/carrier/pending")
def list_carrier_pending_paperwork(
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    """Return all pending invoice_document_requests for the authenticated carrier."""
    if not user.carrier_id:
        return ok([])  # dispatcher — not applicable here

    sb = get_supabase()

    # Fetch carrier's invoices
    try:
        inv_result = (
            sb.table("invoices")
            .select("id, load_id, invoice_number")
            .eq("carrier_id", user.carrier_id)
            .is_("deleted_at", "null")
            .execute()
        )
        invoices = inv_result.data or []
    except Exception:
        return ok([])

    if not invoices:
        return ok([])

    inv_map = {i["id"]: i for i in invoices}
    inv_ids = list(inv_map.keys())

    # Fetch pending requests for those invoices
    try:
        req_result = (
            sb.table("invoice_document_requests")
            .select("*")
            .in_("invoice_id", inv_ids)
            .eq("status", "pending")
            .execute()
        )
        requests = req_result.data or []
    except Exception:
        return ok([])

    if not requests:
        return ok([])

    # Enrich with load lane info
    load_ids = list({inv_map[r["invoice_id"]]["load_id"] for r in requests if inv_map.get(r.get("invoice_id"), {}).get("load_id")})
    loads_map: dict = {}
    try:
        if load_ids:
            ld_result = sb.table("loads").select("id, load_number, origin, destination").in_("id", load_ids).execute()
            loads_map = {ld["id"]: ld for ld in (ld_result.data or [])}
    except Exception:
        pass

    dispatcher_url = getattr(settings, "dispatcher_url", "http://localhost:3001").rstrip("/")

    return ok([
        {
            "request_id": req["id"],
            "invoice_id": req["invoice_id"],
            "invoice_number": inv_map.get(req["invoice_id"], {}).get("invoice_number"),
            "load_id": inv_map.get(req["invoice_id"], {}).get("load_id"),
            "load_number": loads_map.get(inv_map.get(req["invoice_id"], {}).get("load_id") or "", {}).get("load_number"),
            "origin": loads_map.get(inv_map.get(req["invoice_id"], {}).get("load_id") or "", {}).get("origin", ""),
            "destination": loads_map.get(inv_map.get(req["invoice_id"], {}).get("load_id") or "", {}).get("destination", ""),
            "doc_types": req.get("doc_types", []),
            "magic_link": f"{dispatcher_url}/upload/{req['token']}",
            "expires_at": req.get("expires_at"),
        }
        for req in requests
    ])



@router.get("/upload/{token}")
def validate_upload_token(token: str) -> ResponseEnvelope:
    req = _service.get_request_by_token(token)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    if req.get("status") == "expired":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This link has expired. Ask your dispatcher for a new one.")

    return ok({
        "request_id": req.get("id"),
        "invoice_number": req.get("invoice_number"),
        "invoice_amount": req.get("invoice_amount"),
        "carrier_name": req.get("carrier_name"),
        "doc_types": req.get("doc_types"),
        "notes": req.get("notes"),
        "expires_at": req.get("expires_at"),
        "status": req.get("status"),
    })


# ── POST /paperwork/upload/{token}/files ── (public, no auth) ─────────────────

@router.post("/upload/{token}/files", status_code=201)
async def upload_document(
    token: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
) -> ResponseEnvelope:
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid doc_type '{doc_type}'. Valid: {', '.join(sorted(VALID_DOC_TYPES))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 20 MB limit",
        )
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    try:
        doc = _service.upload_file(
            token=token,
            doc_type=doc_type,
            filename=file.filename or "upload",
            file_bytes=file_bytes,
            content_type=file.content_type or "application/octet-stream",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc))
    except Exception as exc:
        logger.exception("File upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    return ok({
        "document_id": doc.get("id"),
        "doc_type": doc.get("doc_type"),
        "file_name": doc.get("file_name"),
        "file_url": doc.get("file_url"),
        "uploaded_at": doc.get("uploaded_at"),
    })


# ── POST /paperwork/invoices/{invoice_id}/files ── (dispatcher upload) ────────

@router.post("/invoices/{invoice_id}/files", status_code=201)
async def upload_document_direct(
    invoice_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid doc_type '{doc_type}'. Valid: {', '.join(sorted(VALID_DOC_TYPES))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 20 MB limit",
        )
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    try:
        doc = _service.upload_file_direct(
            invoice_id=invoice_id,
            org_id=user.organization_id,
            doc_type=doc_type,
            filename=file.filename or "upload",
            file_bytes=file_bytes,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        logger.exception("Direct file upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    return ok({
        "document_id": doc.get("id"),
        "doc_type": doc.get("doc_type"),
        "file_name": doc.get("file_name"),
        "file_url": doc.get("file_url"),
        "uploaded_at": doc.get("uploaded_at"),
    })


# ── GET /paperwork/invoices/{invoice_id}/documents ── (auth required) ─────────

@router.get("/invoices/{invoice_id}/documents")
def list_invoice_documents(
    invoice_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    from app.config import get_supabase as _get_sb
    org_id = user.organization_id
    if not org_id:
        try:
            inv = _get_sb().table("invoices").select("organization_id").eq("id", invoice_id).maybe_single().execute()
            org_id = (inv.data or {}).get("organization_id") if inv else None
        except Exception:
            pass
        if not org_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not resolve organization for this invoice")
    result = _service.list_documents(invoice_id=invoice_id, org_id=org_id)
    return ok(result)


# ── PATCH /paperwork/invoices/{invoice_id}/documents/{doc_id} ── (dispatcher) ─

@router.patch("/invoices/{invoice_id}/documents/{doc_id}")
def update_invoice_document(
    invoice_id: str,
    doc_id: str,
    payload: UpdateDocumentIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    try:
        doc = _service.update_document(doc_id=doc_id, invoice_id=invoice_id, org_id=user.organization_id, updates=updates)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return ok(doc)


# ── DELETE /paperwork/invoices/{invoice_id}/documents/{doc_id} ── (dispatcher) ─

@router.delete("/invoices/{invoice_id}/documents/{doc_id}", status_code=204)
def delete_invoice_document(
    invoice_id: str,
    doc_id: str,
    user: CurrentUser = Depends(require_dispatcher),
) -> Response:
    deleted = _service.delete_document(doc_id=doc_id, invoice_id=invoice_id, org_id=user.organization_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return Response(status_code=204)
