import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common.schemas import ResponseEnvelope, ok
from app.config import get_supabase
from app.middleware.auth import CurrentUser, require_authenticated

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackIn(BaseModel):
    category: str = "bug"          # bug, feature, ux, other
    page: str | None = None        # auto-captured from frontend
    description: str
    severity: str = "medium"       # low, medium, high, critical


@router.post("", response_model=ResponseEnvelope)
async def submit_feedback(body: FeedbackIn, user: CurrentUser = Depends(require_authenticated)):
    sb = get_supabase()
    row = {
        "organization_id": user.organization_id,
        "user_id": user.user_id,
        "category": body.category,
        "page": body.page,
        "description": body.description,
        "severity": body.severity,
        "status": "new",
    }
    result = sb.table("feedback").insert(row).execute()
    logger.info("Feedback submitted by %s: %s", user.user_id, body.category)
    return ok(result.data[0] if result.data else row)


@router.get("", response_model=ResponseEnvelope)
async def list_feedback(user: CurrentUser = Depends(require_authenticated)):
    sb = get_supabase()
    result = (
        sb.table("feedback")
        .select("*")
        .eq("organization_id", user.organization_id)
        .order("created_at", desc=True)
        .execute()
    )
    return ok(result.data or [])
