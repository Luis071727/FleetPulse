from fastapi import APIRouter, Depends

from app.actions.service import get_todays_actions
from app.common.schemas import ResponseEnvelope, ok
from app.middleware.auth import CurrentUser, require_authenticated

router = APIRouter(prefix="/actions", tags=["actions"])


@router.get("/today")
def today_actions(
    user: CurrentUser = Depends(require_authenticated),
) -> ResponseEnvelope:
    """Return today's prioritized actionable tasks for the authenticated user."""
    actions = get_todays_actions(user)
    return ok(actions, total=len(actions))
