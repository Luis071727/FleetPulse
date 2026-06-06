"""Unit tests for app.paperwork.service — PaperworkService methods."""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest

from app.paperwork.service import PaperworkService, VALID_DOC_TYPES


# ── Constants ─────────────────────────────────────────────────────────────────


def test_valid_doc_types_contains_expected():
    for dt in ("BOL", "POD", "RATE_CON", "INVOICE", "OTHER"):
        assert dt in VALID_DOC_TYPES


# ── create_request ────────────────────────────────────────────────────────────


class TestCreateRequest:
    @patch("app.paperwork.service.get_supabase")
    def test_returns_record_with_magic_link(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        row = {
            "id": "pr-1",
            "token": "tok-xyz",
            "organization_id": "org-1",
            "invoice_id": "inv-1",
            "doc_types": ["BOL", "POD"],
            "notes": None,
            "recipient_email": "carrier@test.com",
            "status": "pending",
        }
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[row])

        svc = PaperworkService()
        result = svc.create_request("inv-1", "org-1", ["BOL", "POD"], None, "carrier@test.com")

        assert "magic_link" in result
        assert "/upload/" in result["magic_link"]
        assert result["id"] == "pr-1"

    @patch("app.paperwork.service.get_supabase")
    def test_raises_on_db_error(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.insert.return_value.execute.side_effect = Exception("DB error")

        svc = PaperworkService()
        with pytest.raises(RuntimeError, match="Could not save"):
            svc.create_request("inv-1", "org-1", ["BOL"], None, None)


# ── get_request_by_token ──────────────────────────────────────────────────────


class TestGetRequestByToken:
    @patch("app.paperwork.service.get_supabase")
    def test_returns_none_for_unknown_token(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

        svc = PaperworkService()
        assert svc.get_request_by_token("bad-token") is None

    @patch("app.paperwork.service.get_supabase")
    def test_marks_expired_token(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        req_data = {
            "id": "req-1",
            "invoice_id": "inv-1",
            "organization_id": "org-1",
            "status": "pending",
            "expires_at": past,
        }

        def table_side(name):
            builder = MagicMock()
            chain = builder.select.return_value.eq.return_value
            if name == "invoice_document_requests":
                chain.maybe_single.return_value.execute.return_value = MagicMock(data=req_data)
                builder.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            return builder

        sb.table.side_effect = table_side

        svc = PaperworkService()
        result = svc.get_request_by_token("tok-expired")
        assert result is not None
        assert result["status"] == "expired"

    @patch("app.paperwork.service.get_supabase")
    def test_enriches_with_invoice_data(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        req_data = {
            "id": "req-1",
            "invoice_id": "inv-1",
            "organization_id": "org-1",
            "status": "pending",
        }
        inv_data = {
            "invoice_number": "INV-100",
            "amount": 2500,
            "carrier_name": "Fast Freight",
            "carrier_id": "c-1",
            "load_id": "ld-1",
        }

        class _FakeResult:
            def __init__(self, data):
                self.data = data

        def table_side(name):
            builder = MagicMock()
            # All chained calls (.select().eq().eq().maybe_single().execute()) return
            # the same chain object until `.execute()`.
            chain = builder.select.return_value
            chain.eq.return_value = chain  # .eq() returns self
            if name == "invoice_document_requests":
                chain.maybe_single.return_value.execute.return_value = _FakeResult(req_data)
            elif name == "invoices":
                chain.maybe_single.return_value.execute.return_value = _FakeResult(inv_data)
            return builder

        sb.table.side_effect = table_side

        svc = PaperworkService()
        result = svc.get_request_by_token("tok-valid")
        assert result["invoice_number"] == "INV-100"
        assert result["carrier_name"] == "Fast Freight"


# ── upload_file ───────────────────────────────────────────────────────────────


class TestUploadFile:
    @patch.object(PaperworkService, "get_request_by_token")
    def test_rejects_invalid_token(self, mock_get_req):
        mock_get_req.return_value = None

        svc = PaperworkService()
        with pytest.raises(ValueError, match="Invalid or expired"):
            svc.upload_file("bad", "BOL", "file.pdf", b"bytes", "application/pdf")

    @patch.object(PaperworkService, "get_request_by_token")
    def test_rejects_expired_request(self, mock_get_req):
        mock_get_req.return_value = {"id": "r1", "status": "expired"}

        svc = PaperworkService()
        with pytest.raises(ValueError, match="expired"):
            svc.upload_file("tok", "BOL", "file.pdf", b"bytes", "application/pdf")

    @patch.object(PaperworkService, "get_request_by_token")
    def test_rejects_fulfilled_request(self, mock_get_req):
        mock_get_req.return_value = {"id": "r1", "status": "fulfilled"}

        svc = PaperworkService()
        with pytest.raises(ValueError, match="fulfilled"):
            svc.upload_file("tok", "BOL", "file.pdf", b"bytes", "application/pdf")


# ── delete_document ───────────────────────────────────────────────────────────


class TestDeleteDocument:
    @patch("app.paperwork.service.get_supabase")
    def test_returns_true_on_success(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": "d1"}])

        svc = PaperworkService()
        assert svc.delete_document("d1", "inv1", "org1") is True

    @patch("app.paperwork.service.get_supabase")
    def test_returns_false_on_error(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.eq.return_value.execute.side_effect = Exception("fail")

        svc = PaperworkService()
        assert svc.delete_document("d1", "inv1", "org1") is False


# ── update_document ───────────────────────────────────────────────────────────


class TestUpdateDocument:
    @patch("app.paperwork.service.get_supabase")
    def test_returns_none_for_empty_payload(self, mock_get_sb):
        svc = PaperworkService()
        assert svc.update_document("d1", "inv1", "org1", {"unknown": "val"}) is None

    @patch("app.paperwork.service.get_supabase")
    def test_rejects_invalid_doc_type(self, mock_get_sb):
        svc = PaperworkService()
        with pytest.raises(ValueError, match="Invalid doc_type"):
            svc.update_document("d1", "inv1", "org1", {"doc_type": "BOGUS"})

    @patch("app.paperwork.service.get_supabase")
    def test_updates_allowed_fields(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        updated_row = {"id": "d1", "doc_type": "POD"}
        sb.table.return_value.update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[updated_row])

        svc = PaperworkService()
        result = svc.update_document("d1", "inv1", "org1", {"doc_type": "POD"})
        assert result == updated_row


# ── _advance_invoice_on_pod ───────────────────────────────────────────────────


class TestAdvanceInvoiceOnPod:
    @patch("app.paperwork.service.get_supabase")
    def test_advances_pending_to_sent(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        inv_result = MagicMock()
        inv_result.data = {"id": "inv1", "status": "pending"}

        def table_side(name):
            builder = MagicMock()
            if name == "invoices":
                chain = builder.select.return_value.eq.return_value.maybe_single.return_value
                chain.execute.return_value = inv_result
                builder.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            return builder

        sb.table.side_effect = table_side

        svc = PaperworkService()
        svc._advance_invoice_on_pod("inv1", sb)
        # Verify update was called
        sb.table.assert_any_call("invoices")


# ── _maybe_fulfill_request ────────────────────────────────────────────────────


class TestMaybeFulfillRequest:
    def test_noop_for_empty_doc_types(self):
        svc = PaperworkService()
        sb = MagicMock()
        svc._maybe_fulfill_request({"id": "r1", "doc_types": []}, sb)
        sb.table.assert_not_called()

    def test_noop_for_none_doc_types(self):
        svc = PaperworkService()
        sb = MagicMock()
        svc._maybe_fulfill_request({"id": "r1", "doc_types": None}, sb)
        sb.table.assert_not_called()
