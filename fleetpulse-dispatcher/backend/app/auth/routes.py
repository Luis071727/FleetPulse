import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.common.schemas import ResponseEnvelope, ok, err
from app.config import get_supabase, safe_execute
from app.auth.service import AuthService, InviteService
from app.middleware.auth import CurrentUser, require_dispatcher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()
invite_service = InviteService()


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    company_name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class InviteCarrierIn(BaseModel):
    email: EmailStr
    carrier_id: str


class AcceptInviteIn(BaseModel):
    token: str
    password: str = Field(min_length=8)


@router.post("/signup", status_code=201)
def signup(payload: SignupIn) -> ResponseEnvelope:
    try:
        result = auth_service.signup(
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            company_name=payload.company_name,
        )
        return ok(result)
    except Exception as exc:
        msg = str(exc)
        logger.exception("Signup failed: %s", msg)
        low = msg.lower()
        if "already registered" in low or "already been registered" in low:
            raise HTTPException(status_code=409, detail="Email already registered")
        if "rate limit" in low:
            raise HTTPException(status_code=429, detail="Too many signup attempts. Please wait a few minutes and try again.")
        if "password" in low and ("weak" in low or "short" in low or "length" in low):
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        raise HTTPException(status_code=400, detail=f"Signup failed: {msg}")


@router.post("/login")
def login(payload: LoginIn) -> ResponseEnvelope:
    try:
        result = auth_service.login(email=payload.email, password=payload.password)
        return ok(result)
    except Exception as exc:
        msg = str(exc)
        if "invalid" in msg.lower():
            raise HTTPException(status_code=401, detail="Invalid email or password")
        logger.exception("Login failed")
        raise HTTPException(status_code=401, detail="Invalid email or password")


@router.post("/invite/carrier")
def invite_carrier(
    payload: InviteCarrierIn,
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    invite = invite_service.create_invite(
        org_id=user.organization_id,
        email=payload.email,
        carrier_id=payload.carrier_id,
        invited_by=user.user_id,
    )
    return ok({
        "sent": True,
        "email": invite["email"],
        "expires_in_hours": 24,
        "carrier_id": invite["carrier_id"],
        "invite_token": invite["token"],
        "magic_link_sent": invite.get("supabase_invite_sent", False),
        "redirect_to": invite.get("redirect_to"),
    })


@router.post("/accept-invite")
def accept_invite(payload: AcceptInviteIn) -> ResponseEnvelope:
    result = invite_service.accept_invite(token=payload.token, password=payload.password)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite link expired or invalid. Request a new one.",
        )

    # Handle specific error codes (FR-004a)
    if "error" in result:
        error_code = result["error"]
        if error_code == "CONSUMED_TOKEN":
            raise HTTPException(
                status_code=410,  # HTTP 410 GONE
                detail="This invite has already been used. Contact your dispatcher for a new invite.",
            )
        if error_code == "EXPIRED_TOKEN":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invite link expired. Request a new one.",
            )

    return ok({
        "user": {
            "id": result.get("user_id"),
            "email": result.get("email"),
            "role": result.get("role"),
            "carrier_id": result.get("carrier_id"),
            "organization_id": result.get("organization_id"),
        },
        "session": {
            "access_token": result.get("access_token", ""),
            "refresh_token": result.get("refresh_token", ""),
        },
    })


@router.post("/resend-invites")
def resend_pending_invites(
    user: CurrentUser = Depends(require_dispatcher),
) -> ResponseEnvelope:
    results = invite_service.bulk_resend_pending(user.organization_id, user.user_id)
    return ok({"resent_count": len(results)})
