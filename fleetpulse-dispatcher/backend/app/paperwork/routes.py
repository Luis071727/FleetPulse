import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
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


# ── POST /paperwork/requests ── (dispatcher only) ─────────────────────────────

@router.post("/requests", status_code=201)
def create_paperwork_request(
    payload: CreateRequestIn,
    user: CurrentUser = Depends(require_dispatcher),
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

    try:
        record = _service.create_request(
            invoice_id=payload.invoice_id,
            org_id=user.organization_id,
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


# ── GET /paperwork/upload/{token} ── (public, no auth) ────────────────────────

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


# ── GET /paperwork/invoices/{invoice_id}/documents ── (auth required) ─────────

@router.get("/invoices/{invoice_id}/documents")
def list_invoice_documents(
    invoice_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    result = _service.list_documents(invoice_id=invoice_id, org_id=user.organization_id)
    return ok(result)
