"""Shared helpers for looking up entity names from in-memory stores."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def lookup_carrier_name(carrier_id: str, fallback: str = "\u2014") -> str:
    """Return the legal_name for *carrier_id* from the in-memory carrier store.

    Imports lazily to avoid circular-import issues at module load time.
    """
    try:
        from app.carriers.service import _CARRIERS

        carrier = next((c for c in _CARRIERS if c.get("id") == carrier_id), None)
        if carrier:
            return carrier.get("legal_name", fallback)
    except Exception:
        pass
    return fallback
