---
description: "Task list for FleetPulse Dispatcher MVP + Insurance Intelligence"
---

# Tasks: FleetPulse Dispatcher MVP + Insurance Intelligence

**Input**: Design docs from `specs/001-fleetpulse-dispatcher-mvp/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Included because the spec explicitly includes mandatory user scenarios and testing outcomes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and base scaffolding.

- [X] T001 Initialize backend service entrypoint in `fleetpulse-dispatcher/backend/app/main.py`
- [X] T002 [P] Initialize backend dependency manifest in `fleetpulse-dispatcher/backend/requirements.txt`
- [X] T003 [P] Initialize frontend app shell in `fleetpulse-dispatcher/frontend/app/layout.tsx`
- [X] T004 [P] Configure frontend dependencies and scripts in `fleetpulse-dispatcher/frontend/package.json`
- [X] T005 [P] Add backend environment template in `fleetpulse-dispatcher/backend/.env.example`
- [X] T006 [P] Add frontend environment template in `fleetpulse-dispatcher/frontend/.env.local.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any user story implementation.

- [X] T007 Create initial Supabase schema migration in `fleetpulse-dispatcher/supabase/migrations/20260317_init_schema.sql`
- [X] T008 [P] Create RLS policy migration for all tables in `fleetpulse-dispatcher/supabase/migrations/20260317_init_rls.sql`
- [X] T009 [P] Create seed migration for baseline org, dispatcher, and carriers in `fleetpulse-dispatcher/supabase/migrations/20260317_seed.sql`
- [X] T010 Implement response envelope and error contracts in `fleetpulse-dispatcher/backend/app/common/schemas.py`
- [X] T011 Implement JWT middleware with role guards in `fleetpulse-dispatcher/backend/app/middleware/auth.py`
- [X] T012 [P] Implement Supabase settings and client bootstrap in `fleetpulse-dispatcher/backend/app/config.py`
- [X] T013 [P] Register `/api/v1` routers in `fleetpulse-dispatcher/backend/app/main.py`
- [X] T014 [P] Set up pytest fixtures and API test client in `fleetpulse-dispatcher/backend/tests/conftest.py`
- [X] T015 [P] Add API prefix and response-envelope contract tests in `fleetpulse-dispatcher/backend/tests/contract/test_platform_contract.py`

**Checkpoint**: Foundation complete; user story implementation can begin.

---

## Phase 3: User Story 1 - Add Carrier via DOT (Priority: P1)

**Goal**: Dispatcher signs up, looks up DOT data, and adds first carrier card.

**Independent Test**: Sign up and add DOT `3812044`; roster shows legal name and MC number.

- [X] T016 [P] [US1] Add auth contract tests for signup and login in `fleetpulse-dispatcher/backend/tests/contract/test_auth_contract.py`
- [X] T017 [P] [US1] Add carrier create/list contract tests in `fleetpulse-dispatcher/backend/tests/contract/test_carrier_contract.py`
- [X] T018 [P] [US1] Add FMCSA contract tests including 404 `{ found: false }` behavior in `fleetpulse-dispatcher/backend/tests/contract/test_fmcsa_contract.py`
- [X] T019 [P] [US1] Add FMCSA latency benchmark tests for SC-002 in `fleetpulse-dispatcher/backend/tests/integration/test_fmcsa_latency.py`
- [X] T020 [US1] Implement `/api/v1/auth/signup` and `/api/v1/auth/login` routes in `fleetpulse-dispatcher/backend/app/auth/routes.py`
- [X] T021 [US1] Implement FMCSA client with retry, timeout, 404 normalization, and 429 rate-limit handling in `fleetpulse-dispatcher/backend/app/fmcsa/client.py`. **Detail**: On HTTP 429 responses, implement exponential backoff retry (base 2s, max 60s) with in-memory request queue (max 100 pending requests). Failed requests MUST be queued and retried on next successful FMCSA call or after backoff window expires. Add contract test in test_fmcsa_contract.py for 429 → retry → success flow.
- [X] T022 [US1] Implement 24-hour FMCSA cache service in `fleetpulse-dispatcher/backend/app/fmcsa/cache.py`
- [X] T023 [US1] Implement DOT onboarding service in `fleetpulse-dispatcher/backend/app/carriers/service.py`
- [X] T024 [US1] Implement `/api/v1/carriers` create/list endpoints in `fleetpulse-dispatcher/backend/app/carriers/routes.py`
- [X] T025 [P] [US1] Implement signup and login pages in `fleetpulse-dispatcher/frontend/app/(auth)/signup/page.tsx`
- [X] T026 [P] [US1] Implement add-carrier modal with prefill behavior in `fleetpulse-dispatcher/frontend/components/AddCarrierModal.tsx`

**Checkpoint**: US1 is independently functional and testable.

---

## Phase 4: User Story 2 - Roster Filter and Search (Priority: P2)

**Goal**: Dispatcher filters/searches the roster and manages invite workflows from the roster.

**Independent Test**: Search "Rodriguez" and apply "Issues" filter to isolate expected carriers.

- [X] T027 [P] [US2] Add carrier filter/search contract tests in `fleetpulse-dispatcher/backend/tests/contract/test_carrier_contract.py`
- [X] T028 [P] [US2] Add roster integration tests for view preference persistence in `fleetpulse-dispatcher/backend/tests/integration/test_carrier_roster.py`
- [X] T029 [US2] Implement carrier status compute logic from loads, invoices, and compliance events in `fleetpulse-dispatcher/backend/app/carriers/service.py`
- [X] T030 [US2] Implement carrier list filtering and search query params in `fleetpulse-dispatcher/backend/app/carriers/routes.py`
- [X] T031 [US2] Implement bulk pending-invite resend endpoint in `fleetpulse-dispatcher/backend/app/auth/routes.py`
- [X] T032 [P] [US2] Implement roster search and status chips UI in `fleetpulse-dispatcher/frontend/app/(dispatcher)/carriers/page.tsx`
- [X] T033 [P] [US2] Implement grid/list preference persistence in `fleetpulse-dispatcher/frontend/services/api.ts`
- [X] T034 [US2] Implement carrier detail drawer timeline and actions in `fleetpulse-dispatcher/frontend/components/DetailDrawer.tsx`

**Checkpoint**: US2 is independently functional and testable.

---

## Phase 5: User Story 3 - Log Load and Track Invoice (Priority: P3)

**Goal**: Dispatcher logs loads with live profitability and tracks auto-created invoices.

**Independent Test**: Log load (`rate=2400`, `driver=800`, `fuel=400`) and verify net profit `1200` plus invoice creation.

- [X] T035 [P] [US3] Add load and invoice contract tests for create/list/update in `fleetpulse-dispatcher/backend/tests/contract/test_load_contract.py`
- [X] T036 [P] [US3] Add load-to-invoice integration test journey in `fleetpulse-dispatcher/backend/tests/integration/test_load_invoice_flow.py`
- [X] T037 [US3] Implement broker lookup and initial trust scoring in `fleetpulse-dispatcher/backend/app/brokers/service.py`
- [X] T038 [US3] Implement `/api/v1/loads` create/list/status routes with net metrics in `fleetpulse-dispatcher/backend/app/loads/routes.py`
- [X] T039 [US3] Implement load-to-invoice trigger function in `fleetpulse-dispatcher/supabase/functions/invoice_on_load.sql`
- [X] T040 [US3] Implement `/api/v1/invoices` list and mark-paid behavior in `fleetpulse-dispatcher/backend/app/invoices/routes.py`
- [X] T041 [P] [US3] Implement log-load modal with live net profit and RPM preview in `fleetpulse-dispatcher/frontend/components/LogLoadModal.tsx`
- [X] T042 [P] [US3] Implement invoice tracker with urgency badges and sorting in `fleetpulse-dispatcher/frontend/app/(dispatcher)/invoices/page.tsx`
- [X] T043 [US3] Implement optimistic mark-paid rollback behavior in `fleetpulse-dispatcher/frontend/components/InvoiceRow.tsx`

**Checkpoint**: US3 is independently functional and testable.

---

## Phase 6: User Story 4 - AI Load Recommendation (Priority: P4)

**Goal**: Dispatcher gets GO/NEGOTIATE/PASS recommendations with threshold reasoning and resilience.

**Independent Test**: Analyze a low-trust load and receive PASS with broker risk indicator.

- [X] T044 [P] [US4] Add AI load-analysis contract tests including timeout and service failure cases in `fleetpulse-dispatcher/backend/tests/contract/test_ai_contract.py`
- [X] T045 [P] [US4] Add AI recommendation integration tests for threshold outcomes in `fleetpulse-dispatcher/backend/tests/integration/test_ai_recommendations.py`
- [X] T046 [US4] Implement Claude client pinned to `claude-sonnet-4-20250514` with prompt caching telemetry in `fleetpulse-dispatcher/backend/app/ai/service.py`
- [X] T047 [US4] Implement strict JSON parsing and schema validation for AI responses in `fleetpulse-dispatcher/backend/app/ai/routes.py`
- [X] T048 [US4] Implement recommendation threshold and target-rate logic in `fleetpulse-dispatcher/backend/app/ai/service.py`
- [X] T049 [US4] Implement `/api/v1/ai/load/analyze` endpoint with cache lookup in `fleetpulse-dispatcher/backend/app/ai/routes.py`
- [X] T050 [P] [US4] Implement load-analysis modal with recommendation badges in `fleetpulse-dispatcher/frontend/components/LoadAnalysisModal.tsx`
- [X] T051 [US4] Implement AI-unavailable fallback and retry state in `fleetpulse-dispatcher/frontend/components/LoadAnalysisModal.tsx`

**Checkpoint**: US4 is independently functional and testable.

---

## Phase 7: User Story 5 - AI Invoice Follow-up Draft (Priority: P5)

**Goal**: Dispatcher generates editable AI follow-up drafts with tone escalation by aging bucket.

**Independent Test**: A 32-day outstanding invoice generates a Final Notice draft with correct broker and amount.

- [X] T052 [P] [US5] Add invoice follow-up tone bucket contract tests in `fleetpulse-dispatcher/backend/tests/contract/test_ai_contract.py`
- [X] T053 [US5] Implement follow-up tone policy service in `fleetpulse-dispatcher/backend/app/invoices/service.py`
- [X] T054 [US5] Implement `/api/v1/ai/invoice/followup` endpoint with counter updates in `fleetpulse-dispatcher/backend/app/ai/routes.py`
- [X] T055 [P] [US5] Implement editable follow-up modal in `fleetpulse-dispatcher/frontend/components/FollowUpModal.tsx`
- [X] T056 [US5] Implement follow-up sent action and invoice metadata refresh in `fleetpulse-dispatcher/frontend/components/InvoiceRow.tsx`

**Checkpoint**: US5 is independently functional and testable.

---

## Phase 8: User Story 6 - Carrier Portal Invite and Dashboard (Priority: P6)

**Goal**: Dispatcher invites carrier and carrier activates into read-only portal via `/portal` path.

**Independent Test**: Invite email link activates account and lands carrier on `/portal/overview` with scoped data.

- [X] T057 [P] [US6] Add contract tests for `/api/v1/auth/invite/carrier` and `/api/v1/auth/accept-invite` in `fleetpulse-dispatcher/backend/tests/contract/test_auth_contract.py`
- [X] T058 [P] [US6] Add portal access integration tests enforcing carrier data scoping in `fleetpulse-dispatcher/backend/tests/integration/test_carrier_portal_access.py`
- [X] T059 [US6] Implement invite and resend flows with 24-hour token expiry in `fleetpulse-dispatcher/backend/app/auth/service.py`
- [X] T060 [US6] Implement `/api/v1/auth/invite/carrier` and `/api/v1/auth/accept-invite` routes in `fleetpulse-dispatcher/backend/app/auth/routes.py`
- [X] T061 [P] [US6] Implement invite-accept and password set flow at `/portal/accept-invite` in `fleetpulse-dispatcher/frontend/app/(portal)/accept-invite/page.tsx`
- [X] T062 [P] [US6] Implement portal overview page with read-only KPI cards in `fleetpulse-dispatcher/frontend/app/(portal)/overview/page.tsx`
- [X] T063 [P] [US6] Implement portal loads and invoices read-only tabs in `fleetpulse-dispatcher/frontend/app/(portal)/overview/loads/page.tsx`
- [X] T064 [US6] Implement persistent free-tier upgrade prompt banner in `fleetpulse-dispatcher/frontend/app/(portal)/layout.tsx`
- [X] T065 [P] [US6] Add responsive viewport E2E tests for 320px portal behavior in `fleetpulse-dispatcher/frontend/tests/e2e/carrier_portal_flow.spec.ts`
- [X] T066 [US6] Add 320px mobile layout QA checklist validation in `specs/001-fleetpulse-dispatcher-mvp/quickstart.md`

**Checkpoint**: US6 is independently functional and satisfies Phase 1 portal gate.

---

## Phase 9: Polish and Cross-Cutting Concerns

**Purpose**: Final hardening, performance verification, and release gating.

- [X] T079 [P] Add end-to-end dispatcher critical flow suite in `fleetpulse-dispatcher/frontend/tests/e2e/dispatcher_flow.spec.ts`
- [X] T080 [P] Add end-to-end carrier invite-to-portal flow suite in `fleetpulse-dispatcher/frontend/tests/e2e/carrier_portal_flow.spec.ts`
- [X] T081 [P] Add playbook response-time tests for 30-second SLA in `fleetpulse-dispatcher/backend/tests/integration/test_playbook_sla.py`
- [X] T082 Implement runtime cost guard and monthly budget checks in `fleetpulse-dispatcher/backend/app/ops/cost_guard.py`
- [X] T083 [P] Add release gate checklist for SC-010 monthly cost target in `specs/001-fleetpulse-dispatcher-mvp/quickstart.md`
- [X] T084 [P] Document API envelopes, JSON guarantees, and FMCSA `{ found: false }` behavior in `fleetpulse-dispatcher/README.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks all user stories.
- Phase 3 through Phase 8 depend on Phase 2 completion.
- Phase 9 (Polish) depends on completion of all Phase 3–8 user story phases.

### User Story Dependencies

- US1 starts after Foundational completion.
- US2 depends on US1 roster baseline.
- US3 depends on US1 and US2.
- US4 depends on US3 load and broker data.
- US5 depends on US3 invoices and US4 AI stack.
- US6 depends on US1 through US3 core data flows.

## Parallel Execution Examples

### User Story 1

- Run `T016`, `T017`, `T018`, and `T019` in parallel.
- Run `T025` and `T026` in parallel.

### User Story 3

- Run `T035` and `T036` in parallel.
- Run `T041` and `T042` in parallel.

### User Story 6

- Run `T061`, `T062`, and `T063` in parallel.
- Run `T057` and `T058` in parallel.

## Implementation Strategy

- MVP first: Complete through US1 for first demonstration.
- Operational core next: Complete US2 and US3.
- Differentiation next: Complete US4 and US5 AI workflows.
- Phase 1 gate completion: Complete US6 portal onboarding.

**Note**: Phase 2 (Insurance Readiness Scoring and playbook generation) is deferred and will proceed as a separate spec/plan cycle after Phase 1 gate validation (dispatcher can add carrier, log load, view invoice).
