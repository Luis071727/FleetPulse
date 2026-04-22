# Plan: Carrier Compliance + Pending Actions Lifecycle
Status: DONE
Branch: claude/review-fleetpulse-architecture-A5RGU
Created: 2026-04-22

## Summary
Make document compliance, pending actions, and uploads behave as a unified
lifecycle. Centralize status evaluation, derive pending actions from documents
via a sync function, and replace raw uploads with a structured renewal flow.

## Phase Index
- [x] P1 — DB migration (`is_active`, `superseded_at`, `compliance_pending_actions`)
- [x] P2 — Backend central engine (`evaluate_document_status`, `sync_pending_actions`)
- [x] P3 — Backend `renew_document()` + hook sync into every mutation
- [x] P4 — New routes: renew, carrier/pending-actions, carriers/{id}/pending-actions
- [x] P5 — Frontend: `RenewDocumentModal`
- [x] P6 — Frontend: rewrite `ComplianceDocRow` with Renew button + force refresh
- [x] P7 — Frontend: filter superseded docs out of dashboard compliance query

---

## P1 — DB Migration

**Files:** `fleetpulse-dispatcher/supabase/migrations/20260422_compliance_lifecycle.sql`

- `compliance_documents` gets `is_active boolean NOT NULL DEFAULT true` + `superseded_at timestamptz`
- new `compliance_pending_actions` table (carrier_id, doc_id, doc_type, kind, expires_at, days_remaining, notified_at)
- RLS: org members + carrier owner may read/write their own rows
- grants to `service_role` and `authenticated`

**Done when:** migration file present; indexes created; UNIQUE(carrier_id, doc_type, kind) enforces one action per doc_type.

---

## P2 — Backend Central Engine

**Files:** `backend/app/carrier_compliance/service.py`

- `evaluate_document_status(doc) -> "active" | "expiring_soon" | "expired"`
- `sync_pending_actions(carrier_id, org_id=None)`:
  - loads all compliance_documents for carrier
  - picks newest active doc per type (fallback: newest of any)
  - persists non-active statuses to `compliance_pending_actions` (delete-then-insert)
  - resilient: swallows DB errors so mutations still succeed
- `list_pending_actions(carrier_id)`: reads cached rows, falls back to live compute

**Done when:** pure function has test coverage for 60d/10d/-1d/no-expiry; sync clears old rows and inserts fresh set idempotently.

---

## P3 — Renewal + Mutation Hooks

**Files:** `backend/app/carrier_compliance/service.py`

- `renew_document(carrier_id, org_id, doc_type, filename, bytes, content_type, issue_date, expires_at)`:
  - marks any prior `is_active=true` rows of this type as `is_active=false, superseded_at=now()`
  - stores new doc via shared `_store_document()` helper (new storage prefix `renewals/`)
  - calls `sync_pending_actions`
  - raises `ValueError` if dates missing or doc_type invalid
- Call `sync_pending_actions(carrier_id, org_id)` inside `upload_file`, `upload_file_direct`, `update_document`, `delete_document`

**Done when:** every mutation triggers sync; renewal supersedes prior active doc atomically from the UI's perspective.

---

## P4 — Routes

**Files:** `backend/app/carrier_compliance/routes.py`

- `POST /carrier-compliance/carriers/{id}/renew` — auth: dispatcher OR owning carrier; multipart file + doc_type + issue_date + expires_at (all required); 400 on missing dates, 413 on oversize
- `GET /carrier-compliance/carriers/{id}/pending-actions` — auth: dispatcher OR owning carrier
- `GET /carrier-compliance/carrier/pending-actions` — JWT-scoped to caller's carrier_id
- `list_carrier_documents` relaxed to `require_authenticated` + ownership check
- `list_documents` now also sets `effective_status` on each doc so UIs can skip client-side recompute

**Done when:** carrier portal can POST to renew with its Supabase bearer token.

---

## P5 — `RenewDocumentModal`

**Files:** `FleetPulse/components/RenewDocumentModal.tsx`

- Modal with Issue Date (required), Expiration Date (required), File (required — Take Photo or Choose File)
- Blocks submit unless all three provided; rejects expiry ≤ issue date
- Escape closes when not submitting
- POSTs multipart to `/carrier-compliance/carriers/{carrierId}/renew` with Supabase bearer
- Surfaces backend error `detail` to the user
- Calls `onRenewed()` on success → parent re-fetches

**Done when:** modal renders, validation blocks submit, success closes and refreshes parent.

---

## P6 — `ComplianceDocRow`

**Files:** `FleetPulse/components/ComplianceDocRow.tsx`, `FleetPulse/app/compliance/page.tsx`

- Remove inline date inputs + two-option UploadButton
- Replace with a single "Renew Document" button that opens `RenewDocumentModal` pre-filled with the doc's current dates
- Drop unused `currentUserId` prop
- Compliance page filters `is_active.is.null,is_active.eq.true` so superseded rows never render

**Done when:** the only mutation path from the carrier portal is via the renewal modal; superseded docs disappear on refresh.

---

## P7 — Dashboard Query

**Files:** `FleetPulse/app/dashboard/page.tsx`

- Add `.or("is_active.is.null,is_active.eq.true")` to the compliance query so renewed docs instantly replace the expired entry in the Pending Actions section

**Done when:** renewing a doc on `/compliance` and returning to `/dashboard` shows no stale expired entry.

---

## Follow-ups (out of scope — noted for later)
- Wire the dispatcher-side `CarrierDetailModal` to the renewal endpoint instead of bespoke upload
- Daily cron that reads `compliance_pending_actions` and sends reminders (`notified_at` field already reserved)
- Add `missing` kind to the pending-actions sync when an organization marks a doc_type as required
