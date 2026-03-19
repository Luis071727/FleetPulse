import logging
import time
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_last_429_at: float = 0.0
_backoff_seconds: float = 2.0
_MAX_BACKOFF: float = 60.0
_MAX_RETRIES: int = 3


@dataclass
class FmcsaResult:
    found: bool
    data: dict
    cached: bool = False


class FmcsaError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class FmcsaClient:
    def __init__(self) -> None:
        self._base_url = settings.fmcsa_base_url
        self._api_key = settings.fmcsa_api_key
        self._timeout = settings.fmcsa_timeout

    def lookup_carrier(self, dot_number: str) -> FmcsaResult:
        """Look up carrier from FMCSA SAFER API by DOT number."""
        if not self._api_key:
            return self._mock_lookup(dot_number)

        url = f"{self._base_url}/{dot_number}"
        params = {"webKey": self._api_key}
        raw = self._fetch_with_retry(url, params, f"DOT {dot_number}")
        if raw is None:
            return FmcsaResult(found=False, data={"found": False})
        return FmcsaResult(found=True, data=self._normalize_carrier(raw))

    def lookup_broker(self, mc_number: str) -> FmcsaResult:
        """Look up broker from FMCSA by MC number."""
        clean_mc = mc_number.upper().removeprefix("MC")
        if not self._api_key:
            return FmcsaResult(found=False, data={"found": False})

        url = f"{self._base_url}/docket-number/{clean_mc}"
        params = {"webKey": self._api_key}
        raw = self._fetch_with_retry(url, params, f"MC {mc_number}")
        if raw is None:
            return FmcsaResult(found=False, data={"found": False})
        return FmcsaResult(found=True, data=self._normalize_broker(raw))

    def _fetch_with_retry(self, url: str, params: dict, label: str) -> dict | None:
        global _last_429_at, _backoff_seconds

        if _last_429_at > 0:
            elapsed = time.time() - _last_429_at
            if elapsed < _backoff_seconds:
                time.sleep(_backoff_seconds - elapsed)

        for attempt in range(_MAX_RETRIES):
            try:
                with httpx.Client(timeout=self._timeout) as client:
                    resp = client.get(url, params=params)

                if resp.status_code == 200:
                    _backoff_seconds = 2.0
                    data = resp.json()
                    content = data.get("content", data)
                    if isinstance(content, list) and len(content) > 0:
                        return content[0]
                    if isinstance(content, dict):
                        return content
                    return data

                if resp.status_code == 404:
                    return None

                if resp.status_code == 429:
                    _last_429_at = time.time()
                    _backoff_seconds = min(_backoff_seconds * 2, _MAX_BACKOFF)
                    logger.warning("FMCSA 429 for %s, backoff %ss", label, _backoff_seconds)
                    time.sleep(_backoff_seconds)
                    continue

                raise FmcsaError(resp.status_code, f"FMCSA returned {resp.status_code}")

            except httpx.TimeoutException:
                logger.warning("FMCSA timeout attempt %d for %s", attempt + 1, label)
                if attempt == _MAX_RETRIES - 1:
                    raise FmcsaError(503, "FMCSA SAFER API timeout")

        raise FmcsaError(503, "FMCSA unavailable after retries")

    def _mock_lookup(self, dot_number: str) -> FmcsaResult:
        """Fallback for development without FMCSA API key."""
        mock_carriers = {
            "3812044": {
                "dot_number": "3812044", "mc_number": "MC100001",
                "legal_name": "Rodriguez Trucking", "dba_name": None,
                "fmcsa_safety_rating": "Satisfactory", "power_units": 12,
                "drivers": 15, "authority_status": "active",
                "operating_status": "AUTHORIZED FOR HHG",
                "phone": "(305) 555-0147", "email": "dispatch@rodrigueztrucking.com",
                "owner_name": "Carlos Rodriguez", "whatsapp": "+13055550147",
                "physical_address": "1200 NW 78th Ave, Miami, FL 33126",
                "mailing_address": "PO Box 441200, Miami, FL 33144",
            },
            "9912044": {
                "dot_number": "9912044", "mc_number": "MC900001",
                "legal_name": "Latency Test Carrier", "dba_name": None,
                "fmcsa_safety_rating": "Satisfactory", "power_units": 5,
                "drivers": 6, "authority_status": "active",
                "operating_status": "AUTHORIZED FOR Property",
                "phone": "(786) 555-0199", "email": "ops@latencycarrier.com",
                "owner_name": "Maria Santos", "whatsapp": "+17865550199",
                "physical_address": "4500 SW 8th St, Coral Gables, FL 33134",
                "mailing_address": "4500 SW 8th St, Coral Gables, FL 33134",
            },
        }
        if dot_number in mock_carriers:
            return FmcsaResult(found=True, data=mock_carriers[dot_number])
        return FmcsaResult(found=False, data={"found": False})

    @staticmethod
    def _normalize_carrier(raw: dict) -> dict:
        c = raw.get("carrier", raw)
        return {
            "dot_number": str(c.get("dotNumber", c.get("dot_number", ""))),
            "legal_name": c.get("legalName", c.get("legal_name", "")),
            "dba_name": c.get("dbaName", c.get("dba_name")),
            "mc_number": c.get("mcNumber", c.get("mc_number")),
            "authority_status": c.get("allowedToOperate", c.get("authority_status", "unknown")),
            "operating_status": c.get("operatingStatus", c.get("operating_status", "")),
            "fmcsa_safety_rating": c.get("safetyRating", c.get("fmcsa_safety_rating")),
            "power_units": _safe_int(c.get("totalPowerUnits", c.get("power_units"))),
            "drivers": _safe_int(c.get("totalDrivers", c.get("drivers"))),
            "phone": c.get("phoneNumber", c.get("phone")),
            "email": c.get("emailAddress", c.get("email")),
            "owner_name": c.get("ownerName", c.get("owner_name")),
            "whatsapp": c.get("whatsapp"),
            "physical_address": c.get("phyStreet", c.get("physical_address")),
            "mailing_address": c.get("mailingStreet", c.get("mailing_address")),
        }

    @staticmethod
    def _normalize_broker(raw: dict) -> dict:
        c = raw.get("carrier", raw)
        return {
            "mc_number": c.get("mcNumber", c.get("mc_number", "")),
            "legal_name": c.get("legalName", c.get("legal_name", "")),
            "authority_status": c.get("allowedToOperate", c.get("authority_status", "unknown")),
            "operating_status": c.get("operatingStatus", c.get("operating_status", "")),
        }


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
