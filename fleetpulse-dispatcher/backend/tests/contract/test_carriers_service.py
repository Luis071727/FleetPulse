"""Unit tests for app.carriers.service — CarrierService methods."""

from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest

from app.carriers.service import CarrierService, _CARRIERS


class TestListCarriers:
    @patch("app.carriers.service.get_supabase")
    def test_returns_data_and_total(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        rows = [
            {"id": "c1", "legal_name": "Acme", "organization_id": "org1"},
            {"id": "c2", "legal_name": "Beta", "organization_id": "org1"},
        ]
        result_mock = MagicMock()
        result_mock.data = rows
        result_mock.count = 2
        chain = sb.table.return_value.select.return_value
        for method in ("eq", "is_", "or_", "order", "range"):
            setattr(chain, method, MagicMock(return_value=chain))
        chain.execute.return_value = result_mock

        svc = CarrierService()
        data, total = svc.list_carriers("org1")
        assert data == rows
        assert total == 2

    @patch("app.carriers.service.get_supabase")
    def test_fallback_to_in_memory(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        chain = sb.table.return_value.select.return_value
        for method in ("eq", "is_", "or_", "order", "range"):
            setattr(chain, method, MagicMock(return_value=chain))
        chain.execute.side_effect = Exception("DB down")

        _CARRIERS.clear()
        _CARRIERS.append({"id": "c1", "legal_name": "Acme", "organization_id": "org1", "status": "active"})

        svc = CarrierService()
        data, total = svc.list_carriers("org1")
        assert len(data) == 1
        assert total == 1
        _CARRIERS.clear()

    @patch("app.carriers.service.get_supabase")
    def test_status_filter_in_memory(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        chain = sb.table.return_value.select.return_value
        for method in ("eq", "is_", "or_", "order", "range"):
            setattr(chain, method, MagicMock(return_value=chain))
        chain.execute.side_effect = Exception("DB down")

        _CARRIERS.clear()
        _CARRIERS.extend([
            {"id": "c1", "legal_name": "Acme", "organization_id": "org1", "status": "active"},
            {"id": "c2", "legal_name": "Beta", "organization_id": "org1", "status": "new"},
        ])

        svc = CarrierService()
        data, total = svc.list_carriers("org1", status="active")
        assert len(data) == 1
        assert data[0]["id"] == "c1"
        _CARRIERS.clear()

    @patch("app.carriers.service.get_supabase")
    def test_search_filter_in_memory(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        chain = sb.table.return_value.select.return_value
        for method in ("eq", "is_", "or_", "order", "range"):
            setattr(chain, method, MagicMock(return_value=chain))
        chain.execute.side_effect = Exception("DB down")

        _CARRIERS.clear()
        _CARRIERS.extend([
            {"id": "c1", "legal_name": "Acme Trucking", "organization_id": "org1", "dot_number": "123"},
            {"id": "c2", "legal_name": "Beta Freight", "organization_id": "org1", "dot_number": "456"},
        ])

        svc = CarrierService()
        data, total = svc.list_carriers("org1", search="acme")
        assert len(data) == 1
        assert data[0]["id"] == "c1"
        _CARRIERS.clear()


class TestGetCarrier:
    @patch("app.carriers.service.get_supabase")
    def test_returns_carrier(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        carrier = {"id": "c1", "legal_name": "Acme"}
        chain = sb.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value
        chain.maybe_single.return_value.execute.return_value = MagicMock(data=carrier)

        svc = CarrierService()
        result = svc.get_carrier("org1", "c1")
        assert result == carrier

    @patch("app.carriers.service.get_supabase")
    def test_fallback_to_in_memory(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        chain = sb.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value
        chain.maybe_single.return_value.execute.side_effect = Exception("fail")

        _CARRIERS.clear()
        _CARRIERS.append({"id": "c1", "organization_id": "org1", "legal_name": "Acme"})

        svc = CarrierService()
        result = svc.get_carrier("org1", "c1")
        assert result["legal_name"] == "Acme"
        _CARRIERS.clear()


class TestCreateFromDot:
    @patch("app.carriers.service.get_supabase")
    def test_duplicate_dot_in_memory_raises(self, mock_get_sb):
        _CARRIERS.clear()
        _CARRIERS.append({
            "organization_id": "org1",
            "dot_number": "123",
        })

        svc = CarrierService()
        with pytest.raises(ValueError, match="already in roster"):
            svc.create_from_dot("org1", "123")
        _CARRIERS.clear()

    @patch("app.carriers.service.FmcsaCacheService")
    @patch("app.carriers.service.get_supabase")
    def test_not_found_in_fmcsa_raises(self, mock_get_sb, mock_cache_cls):
        _CARRIERS.clear()
        sb = MagicMock()
        mock_get_sb.return_value = sb
        chain = sb.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value
        chain.maybe_single.return_value.execute.return_value = MagicMock(data=None)

        cache_instance = MagicMock()
        mock_cache_cls.return_value = cache_instance

        fmcsa_result = MagicMock()
        fmcsa_result.found = False
        cache_instance.get_or_fetch_carrier.return_value = (fmcsa_result, False)

        svc = CarrierService()
        svc._cache = cache_instance
        with pytest.raises(LookupError, match="not found"):
            svc.create_from_dot("org1", "999999")
        _CARRIERS.clear()


class TestUpdateCarrier:
    @patch("app.carriers.service.safe_execute")
    @patch("app.carriers.service.get_supabase")
    def test_updates_and_returns(self, mock_get_sb, mock_safe):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        updated_row = {"id": "c1", "status": "active", "notes": "updated"}
        mock_safe.return_value = MagicMock(data=[updated_row])

        _CARRIERS.clear()
        _CARRIERS.append({"id": "c1", "organization_id": "org1", "status": "new"})

        svc = CarrierService()
        result = svc.update_carrier("org1", "c1", {"status": "active"})
        assert result == updated_row
        _CARRIERS.clear()

    @patch("app.carriers.service.safe_execute")
    @patch("app.carriers.service.get_supabase")
    def test_fallback_to_in_memory(self, mock_get_sb, mock_safe):
        mock_safe.side_effect = Exception("fail")

        _CARRIERS.clear()
        _CARRIERS.append({"id": "c1", "organization_id": "org1", "status": "new"})

        svc = CarrierService()
        result = svc.update_carrier("org1", "c1", {"status": "active"})
        assert result["status"] == "active"
        _CARRIERS.clear()


class TestCreateManual:
    @patch("app.carriers.service.get_supabase")
    def test_creates_with_unverified_status(self, mock_get_sb):
        _CARRIERS.clear()
        sb = MagicMock()
        mock_get_sb.return_value = sb

        insert_data = {"id": "c-new", "legal_name": "New Carrier", "verification_status": "unverified"}
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[insert_data])
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

        svc = CarrierService()
        result = svc.create_manual("org1", {"legal_name": "New Carrier"})
        assert result is not None
        _CARRIERS.clear()

    @patch("app.carriers.service.get_supabase")
    def test_duplicate_dot_raises(self, mock_get_sb):
        _CARRIERS.clear()
        _CARRIERS.append({"organization_id": "org1", "dot_number": "123"})

        svc = CarrierService()
        with pytest.raises(ValueError):
            svc.create_manual("org1", {"dot_number": "123", "legal_name": "Dup"})
        _CARRIERS.clear()


class TestSoftDelete:
    @patch("app.carriers.service.safe_execute")
    @patch("app.carriers.service.get_supabase")
    def test_returns_true_on_success(self, mock_get_sb, mock_safe):
        sb = MagicMock()
        mock_get_sb.return_value = sb
        mock_safe.return_value = MagicMock(data=[{"id": "c1"}])

        svc = CarrierService()
        assert svc.soft_delete("org1", "c1") is True
