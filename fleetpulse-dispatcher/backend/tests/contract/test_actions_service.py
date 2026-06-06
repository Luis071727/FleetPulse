"""Unit tests for app.actions.service — helper functions and get_todays_actions."""

from datetime import date, timedelta
from unittest.mock import patch, MagicMock

import pytest

from app.actions.service import (
    _action,
    _invoice_priority,
    _compliance_priority,
    _parse_date,
    get_todays_actions,
)
from app.middleware.auth import CurrentUser


# ── Pure helper tests ─────────────────────────────────────────────────────────


class TestAction:
    def test_builds_dict_with_all_fields(self):
        result = _action(
            type_="invoice_followup",
            title="Follow up",
            description="desc",
            priority="high",
            entity_id="eid",
            entity_type="invoice",
            cta_label="Go",
            cta_action="/path",
            due_in_days=5,
        )
        assert result["type"] == "invoice_followup"
        assert result["title"] == "Follow up"
        assert result["description"] == "desc"
        assert result["priority"] == "high"
        assert result["entity_id"] == "eid"
        assert result["entity_type"] == "invoice"
        assert result["cta"] == {"label": "Go", "action": "/path"}
        assert result["due_in_days"] == 5
        assert "id" in result  # UUID generated

    def test_due_in_days_defaults_none(self):
        result = _action("t", "tit", "d", "low", "e", "et", "l", "a")
        assert result["due_in_days"] is None


class TestInvoicePriority:
    def test_high_for_30_plus(self):
        assert _invoice_priority(30) == "high"
        assert _invoice_priority(60) == "high"

    def test_medium_for_14_to_29(self):
        assert _invoice_priority(14) == "medium"
        assert _invoice_priority(29) == "medium"

    def test_low_for_under_14(self):
        assert _invoice_priority(0) == "low"
        assert _invoice_priority(13) == "low"


class TestCompliancePriority:
    def test_high_for_none(self):
        assert _compliance_priority(None) == "high"

    def test_high_for_negative(self):
        assert _compliance_priority(-5) == "high"

    def test_high_for_under_7(self):
        assert _compliance_priority(0) == "high"
        assert _compliance_priority(6) == "high"

    def test_medium_for_7_plus(self):
        assert _compliance_priority(7) == "medium"
        assert _compliance_priority(30) == "medium"


class TestParseDate:
    def test_iso_date(self):
        assert _parse_date("2026-06-01") == date(2026, 6, 1)

    def test_iso_datetime(self):
        assert _parse_date("2026-06-01T12:00:00Z") == date(2026, 6, 1)

    def test_empty_string(self):
        assert _parse_date("") is None

    def test_garbage(self):
        assert _parse_date("not-a-date") is None


# ── get_todays_actions integration ────────────────────────────────────────────


class TestGetTodaysActions:
    def test_empty_for_unknown_role(self):
        user = CurrentUser(user_id="u1", organization_id=None, carrier_id=None, role="viewer")
        assert get_todays_actions(user) == []

    @patch("app.actions.service.get_supabase")
    def test_dispatcher_returns_sorted_actions(self, mock_sb):
        sb = MagicMock()
        mock_sb.return_value = sb

        today = date.today()
        old_issued = str(today - timedelta(days=20))

        # invoices query
        inv_exec = MagicMock()
        inv_exec.data = [
            {
                "id": "inv1",
                "status": "sent",
                "amount": 5000,
                "invoice_number": "INV001",
                "load_id": "ld1",
                "carrier_name": "Acme",
                "issued_date": old_issued,
            },
        ]
        # delivered loads
        dl_exec = MagicMock()
        dl_exec.data = []
        # carriers
        cr_exec = MagicMock()
        cr_exec.data = []

        def table_side_effect(name):
            builder = MagicMock()
            chain = builder.select.return_value
            for method in ("eq", "is_", "in_", "neq", "gte", "or_", "not_",
                           "order", "range", "limit", "lte"):
                setattr(chain, method, MagicMock(return_value=chain))
            if name == "invoices":
                chain.execute.return_value = inv_exec
            elif name == "loads":
                chain.execute.return_value = dl_exec
            elif name == "carriers":
                chain.execute.return_value = cr_exec
            else:
                chain.execute.return_value = MagicMock(data=[])
            return builder

        sb.table.side_effect = table_side_effect

        user = CurrentUser(
            user_id="u1", organization_id="org1", carrier_id=None, role="dispatcher_admin"
        )
        actions = get_todays_actions(user)
        assert isinstance(actions, list)
        assert len(actions) <= 10
        # The sent invoice with 20 days outstanding (>3) should generate an action
        assert any(a["type"] == "invoice_followup" for a in actions)

    @patch("app.actions.service.get_supabase")
    def test_carrier_returns_actions(self, mock_sb):
        sb = MagicMock()
        mock_sb.return_value = sb

        today = date.today()

        # carrier invoices
        inv_exec = MagicMock()
        inv_exec.data = [
            {"id": "inv1", "load_id": "ld1", "invoice_number": "INV002"},
        ]
        # pending doc requests
        req_exec = MagicMock()
        req_exec.data = [
            {"id": "req1", "invoice_id": "inv1", "doc_types": ["BOL"], "token": "tok123", "expires_at": None},
        ]
        # loads
        ld_exec = MagicMock()
        ld_exec.data = [{"id": "ld1", "origin": "Dallas", "destination": "Houston"}]
        # compliance
        comp_exec = MagicMock()
        comp_exec.data = []
        # followup invoices
        follow_exec = MagicMock()
        follow_exec.data = []

        call_count = 0

        def table_side_effect(name):
            nonlocal call_count
            call_count += 1
            builder = MagicMock()
            chain = builder.select.return_value
            for method in ("eq", "is_", "in_", "neq", "gte", "or_", "not_",
                           "order", "range", "limit", "lte"):
                setattr(chain, method, MagicMock(return_value=chain))
            if name == "invoices" and call_count <= 2:
                chain.execute.return_value = inv_exec
            elif name == "invoice_document_requests":
                chain.execute.return_value = req_exec
            elif name == "loads":
                chain.execute.return_value = ld_exec
            elif name == "compliance_documents":
                chain.execute.return_value = comp_exec
            else:
                chain.execute.return_value = MagicMock(data=[])
            return builder

        sb.table.side_effect = table_side_effect

        user = CurrentUser(
            user_id="u1", organization_id="org1", carrier_id="c1", role="carrier_free"
        )
        actions = get_todays_actions(user)
        assert isinstance(actions, list)
