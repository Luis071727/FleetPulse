import logging
import os

from supabase import Client, create_client
from pydantic_settings import BaseSettings, SettingsConfigDict
from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)

# --- Monkey-patch postgrest-py: maybe_single().execute() throws APIError on
#     204 (no rows) instead of returning an empty result.  Fix it globally. ---
try:
    from postgrest._sync.request_builder import SyncMaybeSingleRequestBuilder

    _orig_maybe_single_execute = SyncMaybeSingleRequestBuilder.execute

    def _patched_maybe_single_execute(self):
        try:
            return _orig_maybe_single_execute(self)
        except APIError as exc:
            if "204" in str(exc) or getattr(exc, "code", "") == "204":

                class _EmptyResult:
                    data = None
                    count = 0

                return _EmptyResult()
            raise

    SyncMaybeSingleRequestBuilder.execute = _patched_maybe_single_execute
    logger.debug("Patched SyncMaybeSingleRequestBuilder.execute for 204 handling")
except Exception:
    logger.warning("Could not patch postgrest maybe_single — 204 errors may still occur")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "FleetPulse API"
    supabase_url: str
    supabase_key: str  # service_role key for backend
    jwt_secret: str  # Supabase JWT secret (Settings > API > JWT Secret)
    anthropic_key: str = ""
    sendgrid_key: str = ""
    fmcsa_api_key: str = ""
    fmcsa_base_url: str = "https://mobile.fmcsa.dot.gov/qc/services/carriers"
    fmcsa_timeout: int = 30
    ai_monthly_budget: float = 30.0
    cors_origins: str = "http://localhost:3000,http://localhost:3001"


settings = Settings()

_supabase_client: Client | None = None


def get_settings() -> Settings:
    return settings


def get_supabase() -> Client:
    """Return the shared Supabase client (service_role).
    WARNING: Do NOT call sb.auth.sign_in/sign_up on this client — that mutates
    its session and all subsequent DB calls run as the signed-in user instead
    of service_role.  Use get_supabase_auth() for auth operations.
    """
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(settings.supabase_url, settings.supabase_key)
    return _supabase_client


def get_supabase_auth() -> Client:
    """Return a fresh, short-lived Supabase client for auth operations.
    This prevents sign_in/sign_up from mutating the shared DB client's session.
    """
    return create_client(settings.supabase_url, settings.supabase_key)


def safe_execute(query, fallback=None):
    """Execute a postgrest query, tolerating RLS/permission errors."""
    try:
        result = query.execute()
        return result
    except (APIError, Exception) as exc:
        exc_str = str(exc)
        if "permission denied" in exc_str or "42501" in exc_str:
            logger.warning("Supabase query blocked (RLS/permissions), using fallback")

            class _Compat:
                data = fallback
                count = 0

            return _Compat()
        raise


def safe_maybe_single(query):
    """Run a .maybe_single().execute() that returns None instead of throwing on 204."""
    try:
        result = query.maybe_single().execute()
        return result.data if result else None
    except APIError as exc:
        if "204" in str(exc) or exc.code == "204":
            return None
        raise
