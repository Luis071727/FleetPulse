import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.config import get_supabase, get_supabase_auth, safe_execute

logger = logging.getLogger(__name__)

# In-memory invite store (for MVP without email service)
_INVITES: dict[str, dict] = {}


class AuthService:
    """Handles signup and login via Supabase Auth (GoTrue)."""

    def signup(self, email: str, password: str, full_name: str, company_name: str) -> dict:
        sb = get_supabase()       # shared client — for DB operations only
        auth_sb = get_supabase_auth()  # disposable client — for auth operations

        # 1. Create Supabase Auth user via admin API
        auth_user = auth_sb.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": full_name,
                "company_name": company_name,
            },
        })
        if not auth_user or not auth_user.user:
            raise ValueError("Supabase Auth signup failed — no user returned")

        supabase_uid = auth_user.user.id

        # 2. Create organization (uses shared service_role client)
        org_id = str(uuid4())
        slug = company_name.lower().replace(" ", "-")[:50]
        org_row = {"id": org_id, "name": company_name, "slug": slug, "plan": "dispatcher_pro"}
        try:
            sb.table("organizations").insert(org_row).execute()
        except Exception as exc:
            logger.error("Failed to create organization: %s", exc)
            raise ValueError(f"Failed to create organization: {exc}")

        # 3. Create user row (uses shared service_role client)
        user_row = {
            "id": supabase_uid,
            "organization_id": org_id,
            "role": "dispatcher_admin",
            "full_name": full_name,
            "email": email,
            "carrier_id": None,
        }
        try:
            sb.table("users").insert(user_row).execute()
        except Exception as exc:
            logger.error("Failed to create user row: %s", exc)
            raise ValueError(f"Failed to create user row: {exc}")

        # 4. Sign in on the disposable client to get a session for the frontend
        session = None
        try:
            session_response = auth_sb.auth.sign_in_with_password({
                "email": email,
                "password": password,
            })
            session = session_response.session
        except Exception:
            logger.warning("Could not auto-login after signup")

        return {
            "user": {
                "id": supabase_uid,
                "email": email,
                "full_name": full_name,
                "organization_id": org_id,
                "role": "dispatcher_admin",
            },
            "session": {
                "access_token": session.access_token if session else "",
                "refresh_token": session.refresh_token if session else "",
            },
            "organization": {"id": org_id, "name": company_name},
        }

    def login(self, email: str, password: str) -> dict:
        sb = get_supabase()           # shared client — for DB lookups
        auth_sb = get_supabase_auth()  # disposable client — for auth

        session_response = auth_sb.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
        session = session_response.session
        auth_user = session_response.user

        if not session or not auth_user:
            raise ValueError("Invalid email or password")

        # Fetch our app user row (shared client stays as service_role)
        result = sb.table("users").select("*").eq("id", auth_user.id).maybe_single().execute()
        user = result.data if result else None

        if not user:
            # User exists in Auth but not in users table — create a minimal row
            user = {
                "id": auth_user.id,
                "email": email,
                "full_name": auth_user.user_metadata.get("full_name", email.split("@")[0]),
                "organization_id": None,
                "role": "dispatcher_admin",
                "carrier_id": None,
            }

        return {
            "user": {
                "id": user["id"],
                "email": user["email"],
                "full_name": user.get("full_name", ""),
                "organization_id": user.get("organization_id"),
                "role": user.get("role", "dispatcher_admin"),
            },
            "session": {
                "access_token": session.access_token,
                "refresh_token": session.refresh_token,
            },
        }


class InviteService:
    def create_invite(self, org_id: str, email: str, carrier_id: str, invited_by: str) -> dict:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(hours=24)
        invite = {
            "token": token,
            "email": email,
            "carrier_id": carrier_id,
            "organization_id": org_id,
            "invited_by": invited_by,
            "expires_at": expires_at.isoformat(),
            "accepted": False,
            "consumed": False,
        }
        _INVITES[token] = invite

        # Update carrier portal status
        try:
            sb = get_supabase()
            safe_execute(sb.table("carriers").update({
                "portal_status": "invited",
                "portal_invite_sent_at": datetime.now(UTC).isoformat(),
                "portal_invite_token_expires_at": expires_at.isoformat(),
                "contact_email": email,
            }).eq("id", carrier_id).eq("organization_id", org_id))
        except Exception:
            logger.warning("Failed to update carrier portal status for invite")

        return invite

    def accept_invite(self, token: str, password: str) -> dict | None:
        invite = _INVITES.get(token)
        if not invite:
            return None

        if invite.get("consumed"):
            return {"error": "CONSUMED_TOKEN"}

        expires_at = datetime.fromisoformat(invite["expires_at"])
        if datetime.now(UTC) > expires_at:
            return {"error": "EXPIRED_TOKEN"}

        if invite["accepted"]:
            return {"error": "CONSUMED_TOKEN"}

        invite["accepted"] = True
        invite["consumed"] = True

        try:
            sb = get_supabase()

            # Create a Supabase Auth user for the carrier
            auth_response = sb.auth.admin.create_user({
                "email": invite["email"],
                "password": password,
                "email_confirm": True,
                "user_metadata": {"role": "carrier_free"},
            })
            supabase_uid = auth_response.user.id

            safe_execute(sb.table("users").insert({
                "id": supabase_uid,
                "organization_id": invite["organization_id"],
                "carrier_id": invite["carrier_id"],
                "role": "carrier_free",
                "full_name": invite["email"].split("@")[0],
                "email": invite["email"],
            }))

            safe_execute(sb.table("carriers").update({
                "portal_status": "active",
            }).eq("id", invite["carrier_id"]))

            # Sign in the new user on a disposable client to get tokens
            auth_sb = get_supabase_auth()
            session_response = auth_sb.auth.sign_in_with_password({
                "email": invite["email"],
                "password": password,
            })
            session = session_response.session

            return {
                "user_id": supabase_uid,
                "organization_id": invite["organization_id"],
                "carrier_id": invite["carrier_id"],
                "role": "carrier_free",
                "email": invite["email"],
                "access_token": session.access_token if session else "",
                "refresh_token": session.refresh_token if session else "",
            }
        except Exception:
            logger.exception("Failed to create carrier user from invite")
            invite["accepted"] = False
            invite["consumed"] = False
            return None

    def resend_invite(self, org_id: str, carrier_id: str) -> dict | None:
        for token, inv in list(_INVITES.items()):
            if inv["carrier_id"] == carrier_id and inv["organization_id"] == org_id:
                email = inv["email"]
                _INVITES.pop(token, None)
                return self.create_invite(org_id, email, carrier_id, inv["invited_by"])
        return None

    def bulk_resend_pending(self, org_id: str, invited_by: str) -> list[dict]:
        sb = get_supabase()
        pending = sb.table("carriers").select("id, contact_email").eq(
            "organization_id", org_id
        ).eq("portal_status", "invited").is_("deleted_at", "null").execute()

        results = []
        for carrier in (pending.data or []):
            if carrier.get("contact_email"):
                inv = self.create_invite(org_id, carrier["contact_email"], carrier["id"], invited_by)
                results.append(inv)
        return results
