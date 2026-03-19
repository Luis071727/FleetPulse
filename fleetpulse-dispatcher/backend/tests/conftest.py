"""Test fixtures — mock Supabase client for integration/contract tests."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from typing import Any

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Minimal in-memory Supabase mock so tests don't require a live DB
# ---------------------------------------------------------------------------


class _MockQueryResult:
    def __init__(self, data: list[dict] | dict | None = None, count: int | None = None, is_single: bool = False):
        if is_single:
            # For single/maybe_single, data should be a dict or None
            self.data = data
            self.count = 1 if data else 0
        else:
            self.data = data if isinstance(data, list) else ([data] if data else [])
            self.count = count if count is not None else len(self.data)


class _MockQueryBuilder:
    def __init__(self, store: dict[str, list[dict]], table_name: str):
        self._store = store
        self._table = table_name
        self._filters: list[tuple[str, str, Any]] = []
        self._order_col: str | None = None
        self._order_desc = False
        self._range_start = 0
        self._range_end = 999
        self._select_cols = "*"
        self._count_mode: str | None = None
        self._single = False
        self._maybe = False

    # chaining helpers
    def select(self, cols="*", count: str | None = None):
        self._select_cols = cols
        self._count_mode = count
        return self

    def eq(self, col, val):
        self._filters.append((col, "eq", val))
        return self

    def neq(self, col, val):
        self._filters.append((col, "neq", val))
        return self

    def gte(self, col, val):
        self._filters.append((col, "gte", val))
        return self

    def is_(self, col, val):
        if val == "null":
            self._filters.append((col, "is_null", True))
        return self

    def ilike(self, col, val):
        self._filters.append((col, "ilike", val))
        return self

    def or_(self, expr):
        return self

    def order(self, col, desc=False):
        self._order_col = col
        self._order_desc = desc
        return self

    def range(self, start, end):
        self._range_start = start
        self._range_end = end
        return self

    def limit(self, n):
        self._range_end = self._range_start + n - 1
        return self

    def single(self):
        self._single = True
        return self

    def maybe_single(self):
        self._maybe = True
        return self

    def _apply_filters(self, rows: list[dict]) -> list[dict]:
        result = list(rows)
        for col, op, val in self._filters:
            if op == "eq":
                result = [r for r in result if r.get(col) == val]
            elif op == "neq":
                result = [r for r in result if r.get(col) != val]
            elif op == "gte":
                result = [r for r in result if str(r.get(col, "")) >= str(val)]
            elif op == "is_null":
                result = [r for r in result if r.get(col) is None]
            elif op == "ilike":
                pattern = val.strip("%").lower()
                result = [r for r in result if pattern in str(r.get(col, "")).lower()]
        return result

    def execute(self) -> _MockQueryResult:
        rows = list(self._store.get(self._table, []))
        rows = self._apply_filters(rows)
        total = len(rows)
        rows = rows[self._range_start : self._range_end + 1]

        if self._single or self._maybe:
            if rows:
                return _MockQueryResult(rows[0], 1, is_single=True)
            return _MockQueryResult(None, 0, is_single=True)

        return _MockQueryResult(rows, total)

    def insert(self, data):
        self._insert_data = data if isinstance(data, list) else [data]
        return self

    def update(self, data):
        self._update_data = data
        return self

    def upsert(self, data):
        return self.insert(data)

    def delete(self):
        self._delete = True
        return self


class _MockInsertBuilder(_MockQueryBuilder):
    pass


class _MockSupabase:
    def __init__(self):
        self._store: dict[str, list[dict]] = {}

    def table(self, name: str) -> _MockQueryBuilder:
        if name not in self._store:
            self._store[name] = []
        builder = _MockQueryBuilder(self._store, name)

        original_execute = builder.execute

        def patched_execute():
            # Handle insert
            if hasattr(builder, "_insert_data"):
                for row in builder._insert_data:
                    if "id" not in row:
                        row["id"] = str(uuid.uuid4())
                    row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                    self._store[name].append(row)
                return _MockQueryResult(builder._insert_data)

            # Handle update
            if hasattr(builder, "_update_data"):
                updated = []
                for row in self._store[name]:
                    match = all(
                        row.get(col) == val
                        for col, op, val in builder._filters
                        if op == "eq"
                    )
                    if match:
                        row.update(builder._update_data)
                        updated.append(row)
                return _MockQueryResult(updated)

            # Handle delete
            if hasattr(builder, "_delete"):
                before = len(self._store[name])
                self._store[name] = [
                    r for r in self._store[name]
                    if not all(r.get(col) == val for col, op, val in builder._filters if op == "eq")
                ]
                return _MockQueryResult([], before - len(self._store[name]))

            return original_execute()

        builder.execute = patched_execute
        return builder

    def rpc(self, name, params=None):
        return _MockQueryBuilder(self._store, "__rpc__")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _mock_supabase():
    """Auto-patch get_supabase so no real DB calls are made."""
    mock_sb = _MockSupabase()

    # Seed a dispatcher user and organization for auth
    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    mock_sb._store["organizations"] = [{"id": org_id, "name": "Test Org"}]
    mock_sb._store["users"] = [{
        "id": user_id,
        "email": "dispatcher@test.com",
        "organization_id": org_id,
        "role": "dispatcher_admin",
        "full_name": "Test Dispatcher",
        "carrier_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }]

    import app.config as config_mod
    original = config_mod._supabase_client
    config_mod._supabase_client = mock_sb
    yield mock_sb
    config_mod._supabase_client = original


@pytest.fixture()
def auth_headers(_mock_supabase):
    """Return auth headers with a valid dispatcher token."""
    user = _mock_supabase._store["users"][0]
    token = f"tok_{user['id']}"
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def org_id(_mock_supabase):
    return _mock_supabase._store["organizations"][0]["id"]


@pytest.fixture()
def client(_mock_supabase) -> TestClient:
    from app.main import app
    from app.middleware.auth import get_current_user, CurrentUser

    user = _mock_supabase._store["users"][0]

    def override_auth():
        return CurrentUser(
            user_id=user["id"],
            organization_id=user["organization_id"],
            carrier_id=user.get("carrier_id"),
            role=user["role"],
        )

    app.dependency_overrides[get_current_user] = override_auth
    yield TestClient(app)
    app.dependency_overrides.clear()
