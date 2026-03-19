# Tasks: Phase 1 UI Polish

**Input**: Design documents from `/specs/002-ui-polish-phase1/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested in feature specification — omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- All paths relative to `fleetpulse-dispatcher/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the inline SVG icon library needed by multiple user stories

- [X] T001 Create SVG icon components file with all 10 icons (BarChart3, Truck, Package, DollarSign, Shield, Zap, Menu, X, AlertTriangle, Lock) using currentColor and 1em default size in frontend/components/icons/index.tsx

**Checkpoint**: Icon library ready — all story phases can now reference these components

---

## Phase 2: User Story 1 — Replace Emojis with SVG Icons (Priority: P1) 🎯 MVP

**Goal**: Eliminate all emoji characters across the dispatcher Command Center and carrier portal, replacing them with inline SVG icons from the icon library created in Phase 1.

**Independent Test**: Load every dispatcher page and carrier portal page. Visually confirm zero emoji characters remain in the sidebar, headers, modals, status badges, and banners.

### Implementation for User Story 1

- [X] T002 [P] [US1] Replace 5 emoji nav icons (📊🚛📦💰🛡️) and bolt logo (⚡) and hamburger (☰) with SVG components in frontend/app/(dispatcher)/layout.tsx
- [X] T003 [P] [US1] Replace lock emoji (🔒) and any other emoji icons with SVG components in frontend/app/(portal)/layout.tsx
- [X] T004 [P] [US1] Replace close button emoji (✕) with X SVG icon in frontend/components/LogLoadModal.tsx (N/A — LogLoadModal is a section component without close button; replaced ✕ in parent carriers/page.tsx and FollowUpModal.tsx instead)
- [X] T005 [P] [US1] Replace close button emoji (✕) with X SVG icon in frontend/components/AddCarrierModal.tsx (N/A — AddCarrierModal is a section component without close button; replaced ✕ in parent carriers/page.tsx instead)
- [X] T006 [P] [US1] Replace warning emoji (⚠) with AlertTriangle SVG icon in overdue invoice indicators in frontend/app/(dispatcher)/invoices/page.tsx
- [X] T007 [P] [US1] Replace any remaining emoji characters in carrier cards and detail drawer in frontend/app/(dispatcher)/carriers/page.tsx
- [X] T008 [US1] Audit all dispatcher and portal pages for any remaining emoji characters and replace with SVG equivalents across frontend/app/(dispatcher)/dashboard/page.tsx and any other files

**Checkpoint**: SC-001 met — zero emoji characters in rendered application. US1 fully functional and testable.

---

## Phase 3: User Story 2 — Add Load Button on Loads Page (Priority: P2)

**Goal**: Provide a top-level "Add Load" entry point on the Loads page so dispatchers can log loads without navigating to a carrier detail drawer first.

**Independent Test**: Navigate to Loads page → click "Add Load" → select carrier → fill form → submit → new load appears in list with auto-generated invoice.

### Implementation for User Story 2

- [X] T009 [US2] Refactor LogLoadModal to accept optional carrierId prop — when absent, render a searchable carrier selector dropdown that loads carriers from listCarriers() in frontend/components/LogLoadModal.tsx
- [X] T010 [US2] Add "Add Load" button to page header and wire it to open LogLoadModal without a pre-selected carrier in frontend/app/(dispatcher)/loads/page.tsx

**Checkpoint**: SC-003 met — dispatcher can create a load from Loads page in under 60 seconds. US2 fully functional.

---

## Phase 4: User Story 3 — Add Invoice Button on Invoices Page (Priority: P2)

**Goal**: Allow dispatchers to manually create standalone invoices (not tied to a load) from the Invoices page.

**Independent Test**: Navigate to Invoices page → click "Add Invoice" → fill carrier/amount/dates → submit → invoice appears in list. Also verify auto-invoice on load creation still works.

### Implementation for User Story 3

- [X] T011 [P] [US3] Add POST /api/v1/invoices endpoint for standalone invoice creation with optional load_id in backend/app/invoices/routes.py and update invoice creation logic to support null load_id in backend/app/invoices/service.py
- [X] T012 [P] [US3] Add createInvoice() function to call POST /api/v1/invoices in frontend/services/api.ts
- [X] T013 [US3] Create AddInvoiceModal component with carrier selector, broker field, amount, issue date, due date, and optional load reference fields following existing modal patterns in frontend/components/AddInvoiceModal.tsx
- [X] T014 [US3] Add "Add Invoice" button to page header and wire it to open AddInvoiceModal in frontend/app/(dispatcher)/invoices/page.tsx

**Checkpoint**: SC-004 met — dispatcher can create a manual invoice in under 45 seconds. Auto-invoice flow unaffected (SC-007). US3 fully functional.

---

## Phase 5: User Story 4 — Manual Carrier Entry After Failed FMCSA Lookup (Priority: P3)

**Goal**: When FMCSA lookup fails or returns no results, allow the dispatcher to manually enter carrier details instead of being blocked.

**Independent Test**: Enter bogus DOT (e.g., 9999999) → FMCSA fails → click "Enter Manually" → fill legal name → submit → carrier appears with "Not Verified" badge. Try adding same DOT again → blocked with link to existing carrier.

### Implementation for User Story 4

- [X] T015 [P] [US4] Add verification_status field (default "verified") and address/phone fields to carrier in-memory store and update CarrierService in backend/app/carriers/service.py
- [X] T016 [P] [US4] Add POST /api/v1/carriers/manual endpoint for manual carrier creation with verification_status "unverified" and DOT uniqueness check (409 Conflict), AND add DOT uniqueness check to existing POST /api/v1/carriers endpoint returning 409 with existing_carrier_id — both in backend/app/carriers/routes.py
- [X] T018 [P] [US4] Add createCarrierManual() function to call POST /api/v1/carriers/manual in frontend/services/api.ts
- [X] T019 [US4] Add "Enter Manually" fallback form to AddCarrierModal — shown when FMCSA lookup fails or times out — with fields for legal name (required), MC number, DOT (pre-filled), address, phone, power units in frontend/components/AddCarrierModal.tsx
- [X] T020 [US4] Add "Not Verified" badge rendering for carriers with verification_status "unverified" in carrier roster cards, list rows, and detail drawer in frontend/app/(dispatcher)/carriers/page.tsx

**Checkpoint**: SC-005 met — dispatcher can add a carrier manually in under 90 seconds. DOT uniqueness enforced. US4 fully functional.

---

## Phase 6: User Story 5 — Scaffold Coming-Soon Integration Placeholders (Priority: P3)

**Goal**: Display professional "Coming Soon" placeholder cards for Phase 2–4 features so future integration areas are scaffolded rather than blank or missing.

**Independent Test**: Navigate to Insurance IQ page → see styled placeholder cards for IRS Scoring, MVR, and DataQs with "Coming in Phase 2" labels.

### Implementation for User Story 5

- [X] T021 [P] [US5] Create reusable ComingSoon component accepting title, description, phase label, and icon props styled with existing design tokens in frontend/components/ComingSoon.tsx
- [X] T022 [US5] Replace the Phase 2 placeholder section on Insurance IQ page with ComingSoon cards for IRS Scoring, MVR Driver Reports, and DataQs Challenges using appropriate SVG icons in frontend/app/(dispatcher)/insurance/page.tsx

**Checkpoint**: SC-006 met — all future-phase areas display styled placeholders. US5 fully functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification and cross-cutting quality checks

- [X] T023 Verify existing carrier-detail-drawer load-logging flow still works after LogLoadModal refactor (SC-007 regression check)
- [X] T024 Verify auto-invoice generation still triggers when creating a load from both the carrier drawer and the new Loads page button (SC-007 regression check)
- [X] T025 Cross-browser visual verification that SVG icons render identically on Windows and macOS (SC-002)
- [X] T026 Run quickstart.md validation — walk through all 5 verification scenarios end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Phase 1 (icons library) — BLOCKS on T001
- **US2 (Phase 3)**: Depends on Phase 1 (icons for close button) — can start after T001
- **US3 (Phase 4)**: Depends on Phase 1 (icons for close button) — can start after T001
- **US4 (Phase 5)**: Depends on Phase 1 (icons for close button) — can start after T001
- **US5 (Phase 6)**: Depends on Phase 1 (icons for placeholders) — can start after T001
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Only depends on Phase 1. No dependency on other stories.
- **US2 (P2)**: Only depends on Phase 1. No dependency on other stories.
- **US3 (P2)**: Only depends on Phase 1. No dependency on other stories.
- **US4 (P3)**: Only depends on Phase 1. No dependency on other stories.
- **US5 (P3)**: Only depends on Phase 1. No dependency on other stories.

All user stories are **independent** — they can be implemented and tested in any order after Phase 1.

### Within Each User Story

- Backend endpoints before frontend API client functions (US3, US4)
- API client functions before modal components (US3, US4)
- Modal components before page integrations (US3, US4)
- All [P] tasks within a phase can run in parallel

### Parallel Opportunities

**After T001 completes, all five user stories can start in parallel.**

Within each story:
- **US1**: T002–T007 are all parallel (different files, no interdependencies)
- **US3**: T011 + T012 are parallel (backend + frontend API, no dependency)
- **US4**: T015 + T016 + T018 are parallel (backend service + routes + frontend API). T017 removed — merged into T016 (same file).
- **US5**: T021 is independent (component creation)

### Parallel Execution Example: Maximum Parallelism

```
Phase 1:  T001 (icons)
           │
           ▼
      ┌────┴────┬──────────┬──────────┬──────────┐
      │         │          │          │          │
  Phase 2   Phase 3    Phase 4    Phase 5    Phase 6
   (US1)     (US2)      (US3)      (US4)      (US5)
      │         │          │          │          │
      │      T009→T010  T011∥T012  T015∥T016  T021→T022
      │                    │       ∥T018
  T002∥T003              T013         │
  ∥T004∥T005              │        T019→T020
  ∥T006∥T007            T014
      │
    T008
      │
      └──────────┬──────────┴──────────┘
                 │
             Phase 7
          T023∥T024∥T025
                 │
              T026
```

---

## Implementation Strategy

**MVP Scope**: User Story 1 (Phase 1 + Phase 2) — replacing emojis with SVG icons is the highest-impact, lowest-risk change. Delivers SC-001 and SC-002 immediately.

**Incremental Delivery**:
1. **Increment 1 (MVP)**: Phase 1 + US1 → polished icon system across all pages
2. **Increment 2**: US2 + US3 → "Add Load" and "Add Invoice" buttons (P2 stories)
3. **Increment 3**: US4 + US5 → manual carrier entry + coming-soon scaffolding (P3 stories)
4. **Increment 4**: Polish phase → regression verification and cross-browser checks

Each increment is independently deployable and testable.
