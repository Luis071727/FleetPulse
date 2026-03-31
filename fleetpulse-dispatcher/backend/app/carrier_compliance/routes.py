import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel

from app.carrier_compliance.service import VALID_DOC_TYPES, CarrierComplianceService
from app.common.schemas import ResponseEnvelope, ok
from app.middleware.auth import CurrentUser, require_authenticated, require_dispatcher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/carrier-compliance", tags=["carrier-compliance"])
_service = CarrierComplianceService()

MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB


class UpdateCarrierDocIn(BaseModel):
    doc_type: str | None = None
    issue_date: str | None = None
    expires_at: str | None = None


class CreateCarrierDocRequestIn(BaseModel):
    carrier_id: str
    doc_types: list[str]
    notes: str | None = None
    recipient_email: str | None = None


# ── POST /carrier-compliance/requests ── (dispatcher only) ────────────────────

@router.post("/requests", status_code=201)
def create_carrier_doc_request(
    payload: CreateCarrierDocRequestIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
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
            carrier_id=payload.carrier_id,
            org_id=user.organization_id,
            doc_types=payload.doc_types,
            notes=payload.notes,
            recipient_email=payload.recipient_email,
        )
    except Exception as exc:
        logger.exception("Failed to create carrier doc request")
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


# ── GET /carrier-compliance/upload/{token} ── (public, no auth) ───────────────

@router.get("/upload/{token}")
def validate_carrier_upload_token(token: str) -> ResponseEnvelope:
    req = _service.get_request_by_token(token)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    if req.get("status") == "expired":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This link has expired. Ask your dispatcher for a new one.")

    return ok({
        "request_id": req.get("id"),
        "carrier_name": req.get("carrier_name"),
        "carrier_mc": req.get("carrier_mc"),
        "doc_types": req.get("doc_types"),
        "notes": req.get("notes"),
        "expires_at": req.get("expires_at"),
        "status": req.get("status"),
    })


# ── POST /carrier-compliance/upload/{token}/files ── (public, no auth) ────────

@router.post("/upload/{token}/files", status_code=201)
async def upload_carrier_document(
    token: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    issue_date: str | None = Form(default=None),
    expires_at: str | None = Form(default=None),
) -> ResponseEnvelope:
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid doc_type '{doc_type}'. Valid: {', '.join(sorted(VALID_DOC_TYPES))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds 20 MB limit")
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    try:
        doc = _service.upload_file(
            token=token,
            doc_type=doc_type,
            filename=file.filename or "upload",
            file_bytes=file_bytes,
            content_type=file.content_type or "application/octet-stream",
            issue_date=issue_date,
            expires_at=expires_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc))
    except Exception as exc:
        logger.exception("Carrier file upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    return ok({
        "document_id": doc.get("id"),
        "doc_type": doc.get("doc_type"),
        "file_name": doc.get("file_name"),
        "uploaded_at": doc.get("uploaded_at"),
    })


# ── POST /carrier-compliance/carriers/{carrier_id}/documents ── (dispatcher) ──

@router.post("/carriers/{carrier_id}/documents", status_code=201)
async def upload_carrier_document_direct(
    carrier_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    issue_date: str | None = Form(default=None),
    expires_at: str | None = Form(default=None),
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid doc_type '{doc_type}'. Valid: {', '.join(sorted(VALID_DOC_TYPES))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds 20 MB limit")
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    try:
        doc = _service.upload_file_direct(
            carrier_id=carrier_id,
            org_id=user.organization_id,
            doc_type=doc_type,
            filename=file.filename or "upload",
            file_bytes=file_bytes,
            content_type=file.content_type or "application/octet-stream",
            issue_date=issue_date,
            expires_at=expires_at,
        )
    except Exception as exc:
        logger.exception("Direct carrier file upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    return ok({
        "document_id": doc.get("id"),
        "doc_type": doc.get("doc_type"),
        "file_name": doc.get("file_name"),
        "issue_date": doc.get("issue_date"),
        "expires_at": doc.get("expires_at"),
        "uploaded_at": doc.get("uploaded_at"),
    })


# ── GET /carrier-compliance/carriers/{carrier_id}/documents ── (auth) ─────────

@router.get("/carriers/{carrier_id}/documents")
def list_carrier_documents(
    carrier_id: str,
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    result = _service.list_documents(carrier_id=carrier_id, org_id=user.organization_id)
    return ok(result)


# ── PATCH /carrier-compliance/carriers/{carrier_id}/documents/{doc_id} ── ────

@router.patch("/carriers/{carrier_id}/documents/{doc_id}")
def update_carrier_document_record(
    carrier_id: str,
    doc_id: str,
    payload: UpdateCarrierDocIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    try:
        doc = _service.update_document(doc_id=doc_id, carrier_id=carrier_id, org_id=user.organization_id, updates=updates)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return ok(doc)


# ── DELETE /carrier-compliance/carriers/{carrier_id}/documents/{doc_id} ── ───

@router.delete("/carriers/{carrier_id}/documents/{doc_id}", status_code=204)
def delete_carrier_document_record(
    carrier_id: str,
    doc_id: str,
    user: CurrentUser = Depends(require_dispatcher),
) -> Response:
    deleted = _service.delete_document(doc_id=doc_id, carrier_id=carrier_id, org_id=user.organization_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return Response(status_code=204)
