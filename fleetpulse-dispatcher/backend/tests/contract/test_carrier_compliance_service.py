"""Unit tests for app.carrier_compliance.service."""

from datetime import date, timedelta
from unittest.mock import patch, MagicMock

import pytest

from app.carrier_compliance.service import (
    evaluate_document_status,
    _parse_date,
    VALID_DOC_TYPES,
    EXPIRING_SOON_WINDOW_DAYS,
    CarrierComplianceService,
)


# ── evaluate_document_status ──────────────────────────────────────────────────


class TestEvaluateDocumentStatus:
    def test_active_when_no_expiry(self):
        assert evaluate_document_status({}) == "active"
        assert evaluate_document_status({"expires_at": None}) == "active"
        assert evaluate_document_status({"expires_at": ""}) == "active"

    def test_active_for_far_future(self):
        future = str(date.today() + timedelta(days=365))
        assert evaluate_document_status({"expires_at": future}) == "active"

    def test_expiring_soon(self):
        soon = str(date.today() + timedelta(days=15))
        assert evaluate_document_status({"expires_at": soon}) == "expiring_soon"

    def test_expiring_soon_boundary(self):
        boundary = str(date.today() + timedelta(days=EXPIRING_SOON_WINDOW_DAYS))
        assert evaluate_document_status({"expires_at": boundary}) == "expiring_soon"

    def test_expired(self):
        past = str(date.today() - timedelta(days=1))
        assert evaluate_document_status({"expires_at": past}) == "expired"

    def test_active_for_unparseable_date(self):
        assert evaluate_document_status({"expires_at": "bad-date"}) == "active"

    def test_handles_iso_timestamp(self):
        future_ts = (date.today() + timedelta(days=365)).isoformat() + "T00:00:00Z"
        assert evaluate_document_status({"expires_at": future_ts}) == "active"


# ── _parse_date ───────────────────────────────────────────────────────────────


class TestParseDateCompliance:
    def test_date_string(self):
        assert _parse_date("2026-03-15") == date(2026, 3, 15)

    def test_timestamp_string(self):
        assert _parse_date("2026-03-15T10:30:00Z") == date(2026, 3, 15)

    def test_short_string_raises(self):
        with pytest.raises(ValueError):
            _parse_date("abc")


# ── VALID_DOC_TYPES constant ──────────────────────────────────────────────────


def test_valid_doc_types_contains_expected():
    for dt in ("MC_AUTHORITY", "W9", "COI", "CDL", "OTHER"):
        assert dt in VALID_DOC_TYPES


# ── CarrierComplianceService ──────────────────────────────────────────────────


class TestCarrierComplianceServiceCreateRequest:
    @patch("app.carrier_compliance.service.get_supabase")
    def test_create_request_returns_record_with_magic_link(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        row_data = {
            "id": "req-1",
            "token": "tok-abc",
            "organization_id": "org-1",
            "carrier_id": "c-1",
            "doc_types": ["COI"],
            "notes": None,
            "recipient_email": "carrier@example.com",
            "status": "pending",
        }
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[row_data]
        )

        svc = CarrierComplianceService()
        result = svc.create_request("c-1", "org-1", ["COI"], None, "carrier@example.com")

        assert "magic_link" in result
        assert "/carrier-upload/" in result["magic_link"]
        assert result["id"] == "req-1"

    @patch("app.carrier_compliance.service.get_supabase")
    def test_create_request_raises_on_db_error(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.insert.return_value.execute.side_effect = Exception("DB down")

        svc = CarrierComplianceService()
        with pytest.raises(RuntimeError, match="Could not save"):
            svc.create_request("c-1", "org-1", ["COI"], None, None)


class TestCarrierComplianceServiceGetRequestByToken:
    @patch("app.carrier_compliance.service.get_supabase")
    def test_returns_none_for_missing_token(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

        svc = CarrierComplianceService()
        assert svc.get_request_by_token("nonexistent") is None

    @patch("app.carrier_compliance.service.get_supabase")
    def test_returns_enriched_request(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        req_data = {
            "id": "req-1",
            "token": "tok-abc",
            "carrier_id": "c-1",
            "organization_id": "org-1",
            "status": "pending",
        }

        carrier_data = {
            "legal_name": "Acme Trucking",
            "mc_number": "MC123",
            "dot_number": "DOT456",
        }

        # The service method calls sb.table("carrier_document_requests")...execute()
        # which returns result.data as req_data (a dict). Then it calls
        # sb.table("carriers")...execute() which returns carrier_data.
        # We need a mock that returns actual dicts for `.data`.
        class _FakeResult:
            def __init__(self, data):
                self.data = data

        call_count = {"n": 0}

        def table_side(name):
            call_count["n"] += 1
            builder = MagicMock()
            chain = builder.select.return_value.eq.return_value
            if name == "carrier_document_requests":
                chain.maybe_single.return_value.execute.return_value = _FakeResult(req_data)
            elif name == "carriers":
                # The carrier lookup chains: .select(...).eq("id", ...).maybe_single().execute()
                chain.maybe_single.return_value.execute.return_value = _FakeResult(carrier_data)
            return builder

        sb.table.side_effect = table_side

        svc = CarrierComplianceService()
        result = svc.get_request_by_token("tok-abc")
        assert result is not None
        assert result["carrier_name"] == "Acme Trucking"


class TestCarrierComplianceServiceRenew:
    @patch("app.carrier_compliance.service.get_supabase")
    def test_renew_requires_dates(self, mock_get_sb):
        svc = CarrierComplianceService()
        with pytest.raises(ValueError, match="Issue date and expiration date"):
            svc.renew_document("c1", "org1", "COI", "file.pdf", b"data", "application/pdf", "", "")

    @patch("app.carrier_compliance.service.get_supabase")
    def test_renew_rejects_invalid_doc_type(self, mock_get_sb):
        svc = CarrierComplianceService()
        with pytest.raises(ValueError, match="Invalid doc_type"):
            svc.renew_document("c1", "org1", "INVALID", "f.pdf", b"d", "app/pdf", "2026-01-01", "2027-01-01")


class TestCarrierComplianceServiceUpdateDocument:
    @patch("app.carrier_compliance.service.get_supabase")
    def test_update_returns_none_for_empty_payload(self, mock_get_sb):
        svc = CarrierComplianceService()
        assert svc.update_document("d1", "c1", "org1", {"unknown_field": "val"}) is None

    @patch("app.carrier_compliance.service.get_supabase")
    def test_update_rejects_invalid_doc_type(self, mock_get_sb):
        svc = CarrierComplianceService()
        with pytest.raises(ValueError, match="Invalid doc_type"):
            svc.update_document("d1", "c1", "org1", {"doc_type": "BOGUS"})


class TestCarrierComplianceServiceDeleteDocument:
    @patch("app.carrier_compliance.service.get_supabase")
    def test_delete_returns_true_on_success(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": "d1"}])

        svc = CarrierComplianceService()
        assert svc.delete_document("d1", "c1", "org1") is True

    @patch("app.carrier_compliance.service.get_supabase")
    def test_delete_returns_false_on_error(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.side_effect = Exception("fail")

        svc = CarrierComplianceService()
        assert svc.delete_document("d1", "c1", "org1") is False
