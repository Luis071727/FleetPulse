# Quickstart: Phase 1 UI Polish

**Feature**: 002-ui-polish-phase1
**Branch**: `002-ui-polish-phase1`

---

## Prerequisites

- Node.js 18+ (frontend)
- Python 3.13+ (backend)
- Both dev servers running (`npm run dev` on frontend, `uvicorn` on backend)

## Implementation Order

Work through these stories in dependency order:

### 1. SVG Icon System (Story 1 — P1, do first)

**Files to create**:
- `frontend/components/icons/index.tsx` — all SVG icon components

**Files to modify**:
- `frontend/app/(dispatcher)/layout.tsx` — replace emoji nav icons
- `frontend/app/(portal)/layout.tsx` — replace emoji icons
- `frontend/components/LogLoadModal.tsx` — replace close button emoji
- `frontend/components/AddCarrierModal.tsx` — replace close button emoji
- `frontend/app/(dispatcher)/invoices/page.tsx` — replace warning emoji
- `frontend/app/(dispatcher)/carriers/page.tsx` — replace any emoji icons

**Verify**: Load every dispatcher page + carrier portal. No emoji characters should remain.

### 2. Add Load Button (Story 2 — P2)

**Files to modify**:
- `frontend/components/LogLoadModal.tsx` — add optional `carrierId` prop; when absent, show carrier selector dropdown
- `frontend/app/(dispatcher)/loads/page.tsx` — add "Add Load" button in header, wire to LogLoadModal
- `frontend/services/api.ts` — no changes needed (reuses `createLoad()`)

**Verify**: Navigate to Loads page → click "Add Load" → select a carrier → fill form → submit → load appears in list.

### 3. Add Invoice Button (Story 3 — P2)

**Files to create**:
- `frontend/components/AddInvoiceModal.tsx` — new modal with carrier/broker/amount/dates fields

**Files to modify**:
- `frontend/app/(dispatcher)/invoices/page.tsx` — add "Add Invoice" button, wire to AddInvoiceModal
- `frontend/services/api.ts` — add `createInvoice()` function
- `backend/app/invoices/routes.py` — add `POST /invoices` endpoint, make `load_id` optional
- `backend/app/invoices/service.py` — support standalone invoice creation

**Verify**: Navigate to Invoices page → click "Add Invoice" → fill form → submit → invoice appears in list. Also verify existing auto-invoice flow still works when logging a load.

### 4. Manual Carrier Entry (Story 4 — P3)

**Files to modify**:
- `frontend/components/AddCarrierModal.tsx` — add "Enter Manually" fallback when FMCSA lookup fails
- `frontend/services/api.ts` — add `createCarrierManual()` function
- `frontend/app/(dispatcher)/carriers/page.tsx` — show "Not Verified" badge for unverified carriers
- `backend/app/carriers/routes.py` — add `POST /carriers/manual` endpoint, add DOT uniqueness to existing `POST /carriers`
- `backend/app/carriers/service.py` — add `verification_status` field, DOT uniqueness check

**Verify**: Enter a bogus DOT (e.g., 9999999) → FMCSA fails → click "Enter Manually" → fill legal name → submit → carrier appears with "Not Verified" badge. Also verify DOT uniqueness — try adding same DOT twice → should block.

### 5. Coming Soon Placeholders (Story 5 — P3)

**Files to create**:
- `frontend/components/ComingSoon.tsx` — reusable placeholder component

**Files to modify**:
- `frontend/app/(dispatcher)/insurance/page.tsx` — add Phase 2 placeholders for IRS, MVR, DataQs

**Verify**: Navigate to Insurance IQ page → see styled placeholder cards for each coming feature.

## Key Design Rules

- All SVG icons: `currentColor`, size via `width/height: 1em` default
- All modals: fixed overlay, centered card, `var(--surface)` background
- All forms: 2-column grid, `IBM Plex Mono` inputs, amber primary buttons
- All new badges: `background: {color}22, color: {color}` pattern (13% opacity background)
- Error messages: `color: #ef4444`
- Loading states: button text "Saving...", opacity 0.7
