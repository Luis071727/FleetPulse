"""Unit tests for app.middleware.auth — JWT decoding, user resolution, guards."""

from unittest.mock import patch, MagicMock

import pytest
from fastapi import HTTPException
from jose import jwt as jose_jwt

from app.middleware.auth import (
    CurrentUser,
    _decode_supabase_jwt,
    _resolve_user_from_sub,
    get_current_user,
    require_dispatcher,
    require_authenticated,
    _user_cache,
)


# ── CurrentUser dataclass ─────────────────────────────────────────────────────


class TestCurrentUser:
    def test_fields(self):
        u = CurrentUser(user_id="u1", organization_id="org1", carrier_id=None, role="dispatcher_admin")
        assert u.user_id == "u1"
        assert u.organization_id == "org1"
        assert u.carrier_id is None
        assert u.role == "dispatcher_admin"


# ── _decode_supabase_jwt ──────────────────────────────────────────────────────


class TestDecodeSupabaseJwt:
    def test_hs256_valid(self):
        secret = "test-secret"
        token = jose_jwt.encode({"sub": "user-1", "role": "authenticated"}, secret, algorithm="HS256")

        with patch("app.middleware.auth.settings") as mock_settings:
            mock_settings.jwt_secret = secret
            payload = _decode_supabase_jwt(token)

        assert payload["sub"] == "user-1"

    def test_invalid_token_raises_401(self):
        with patch("app.middleware.auth.settings") as mock_settings:
            mock_settings.jwt_secret = "secret"
            with pytest.raises(HTTPException) as exc_info:
                _decode_supabase_jwt("not.a.jwt")
            assert exc_info.value.status_code == 401

    def test_expired_token_raises_401(self):
        import time
        secret = "test-secret"
        token = jose_jwt.encode(
            {"sub": "user-1", "exp": int(time.time()) - 3600},
            secret,
            algorithm="HS256",
        )
        with patch("app.middleware.auth.settings") as mock_settings:
            mock_settings.jwt_secret = secret
            with pytest.raises(HTTPException) as exc_info:
                _decode_supabase_jwt(token)
            assert exc_info.value.status_code == 401


# ── _resolve_user_from_sub ────────────────────────────────────────────────────


class TestResolveUserFromSub:
    def setup_method(self):
        _user_cache.clear()

    @patch("app.middleware.auth.get_supabase")
    def test_found_in_users_table(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        user_row = {
            "id": "sub-1",
            "organization_id": "org-1",
            "carrier_id": None,
            "role": "dispatcher_admin",
        }

        def table_side(name):
            builder = MagicMock()
            chain = builder.select.return_value.eq.return_value
            if name == "users":
                chain.maybe_single.return_value.execute.return_value = MagicMock(data=user_row)
            elif name == "carriers":
                chain.limit.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)
            return builder

        sb.table.side_effect = table_side

        result = _resolve_user_from_sub("sub-1")
        assert result.user_id == "sub-1"
        assert result.role == "dispatcher_admin"

    @patch("app.middleware.auth.get_supabase")
    def test_cache_hit(self, mock_get_sb):
        _user_cache["cached-sub"] = {
            "id": "cached-sub",
            "organization_id": "org-1",
            "carrier_id": "c-1",
            "role": "carrier_free",
        }
        result = _resolve_user_from_sub("cached-sub")
        assert result.user_id == "cached-sub"
        assert result.carrier_id == "c-1"
        mock_get_sb.assert_not_called()

    @patch("app.middleware.auth.get_supabase")
    def test_carrier_portal_user(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        def table_side(name):
            builder = MagicMock()
            chain = builder.select.return_value.eq.return_value
            if name == "users":
                chain.maybe_single.return_value.execute.return_value = MagicMock(data=None)
            elif name == "carriers":
                chain.limit.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                    data={"id": "carrier-1", "organization_id": "org-1"}
                )
            return builder

        sb.table.side_effect = table_side

        result = _resolve_user_from_sub("carrier-sub")
        assert result.carrier_id == "carrier-1"
        assert result.role == "carrier_free"

    @patch("app.middleware.auth.get_supabase")
    def test_unknown_sub_raises_401(self, mock_get_sb):
        sb = MagicMock()
        mock_get_sb.return_value = sb

        def table_side(name):
            builder = MagicMock()
            chain = builder.select.return_value.eq.return_value
            if name == "users":
                chain.maybe_single.return_value.execute.return_value = MagicMock(data=None)
            elif name == "carriers":
                chain.limit.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)
            return builder

        sb.table.side_effect = table_side

        with pytest.raises(HTTPException) as exc_info:
            _resolve_user_from_sub("ghost-sub")
        assert exc_info.value.status_code == 401

    def teardown_method(self):
        _user_cache.clear()


# ── get_current_user ──────────────────────────────────────────────────────────


class TestGetCurrentUser:
    def test_missing_bearer_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user("")
        assert exc_info.value.status_code == 401
        assert "Missing bearer token" in exc_info.value.detail

    def test_no_bearer_prefix_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user("Token abc123")
        assert exc_info.value.status_code == 401

    @patch("app.middleware.auth._resolve_user_from_sub")
    @patch("app.middleware.auth._decode_supabase_jwt")
    def test_missing_sub_raises_401(self, mock_decode, mock_resolve):
        mock_decode.return_value = {"role": "authenticated"}
        with pytest.raises(HTTPException) as exc_info:
            get_current_user("Bearer valid-token")
        assert exc_info.value.status_code == 401
        assert "subject" in exc_info.value.detail

    @patch("app.middleware.auth._resolve_user_from_sub")
    @patch("app.middleware.auth._decode_supabase_jwt")
    def test_valid_token_returns_user(self, mock_decode, mock_resolve):
        mock_decode.return_value = {"sub": "u1"}
        expected = CurrentUser(user_id="u1", organization_id="org1", carrier_id=None, role="dispatcher_admin")
        mock_resolve.return_value = expected

        result = get_current_user("Bearer valid-token")
        assert result == expected


# ── require_dispatcher ────────────────────────────────────────────────────────


class TestRequireDispatcher:
    def test_allows_dispatcher_admin(self):
        user = CurrentUser(user_id="u1", organization_id="org1", carrier_id=None, role="dispatcher_admin")
        assert require_dispatcher(user) == user

    def test_rejects_non_dispatcher(self):
        user = CurrentUser(user_id="u1", organization_id="org1", carrier_id="c1", role="carrier_free")
        with pytest.raises(HTTPException) as exc_info:
            require_dispatcher(user)
        assert exc_info.value.status_code == 403


# ── require_authenticated ─────────────────────────────────────────────────────


class TestRequireAuthenticated:
    def test_returns_user(self):
        user = CurrentUser(user_id="u1", organization_id="org1", carrier_id=None, role="dispatcher_admin")
        assert require_authenticated(user) == user
