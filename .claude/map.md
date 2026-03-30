# FleetPulse Codebase Connection Map

Use this file before any implementation task. Find the feature area, read only those files.
Update this map after any research phase that reveals new connections.

Last updated: 2026-03-30

---

## Global Wiring

```
Browser → services/api.ts (apiFetch) → GET/POST/PATCH/DELETE http://localhost:8000/api/v1
                                        ↓
                               app/main.py (FastAPI)
                                        ↓
                     api_v1 router → domain routers (prefix /api/v1)
                                        ↓
                              routes.py → service.py → Supabase DB
                                                      → in-memory fallback (_LOADS, _INVOICES, _CARRIERS)
```

**Auth gate (Dispatcher):**
- `services/api.ts:73` — injects `Authorization: Bearer <token>` from localStorage `fleetpulse:token`
- `services/api.ts:84` — 401 → clears auth → redirects to `/login`
- `backend/app/middleware/auth.py` — `require_dispatcher` / `require_authenticated` decorators on every route

**Auth gate (Carrier Portal):**
- `FleetPulse/middleware.ts` — Supabase session check → redirects to `/auth/login` if unauthenticated

**Response shape (all backend routes):**
```json
{ "data": <T>, "error": null | "message", "error_code": null | "CODE", "meta": { "total": N, "limit": N, "offset": N } }
```
Helper: `app/common/schemas.py` → `ok()`, `ResponseEnvelope`

---

## Feature Areas

---

### AUTH — Dispatcher Login/Signup

| Layer | File | Notes |
|-------|------|-------|
| Page (login) | `fleetpulse-dispatcher/frontend/app/(auth)/login/page.tsx` | Calls `login()` from api.ts |
| Page (signup) | `fleetpulse-dispatcher/frontend/app/(auth)/signup/page.tsx` | Calls `signup()` from api.ts |
| Page (accept-invite) | `fleetpulse-dispatcher/frontend/app/(portal)/accept-invite/page.tsx` | Carrier invite flow |
| API calls | `services/api.ts:103–129` | `login`, `signup`, `inviteCarrier`, `acceptInvite` |
| Backend route | `backend/app/auth/routes.py` | `POST /auth/login`, `/auth/signup`, `/auth/invite/carrier`, `/auth/accept-invite` |
| Backend service | `backend/app/auth/service.py` | Supabase Auth Admin API |
| Middleware | `backend/app/middleware/auth.py` | JWT decode, `CurrentUser`, role checks |
| Token storage | `services/api.ts:22–36` | `getToken()`, `setToken()`, `clearAuth()` stored in localStorage `fleetpulse:token` |

**Auth flow:** Login → JWT returned → stored in localStorage → injected on every `apiFetch` call.

---

### AUTH — Carrier Portal

| Layer | File | Notes |
|-------|------|-------|
| Page | `FleetPulse/app/auth/login/page.tsx` | Supabase client-side sign-in |
| Middleware | `FleetPulse/middleware.ts` | Session guard, redirects to `/auth/login` |
| Server client | `FleetPulse/lib/supabase-server.ts` | Server-side Supabase (cookies) |
| Browser client | `FleetPulse/lib/supabase.ts` | Client-side Supabase |
| Root layout | `FleetPulse/app/layout.tsx` | Session provider wraps all pages |

---

### LOADS — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/loads/page.tsx` | Lists + filters loads |
| Create modal | `components/LogLoadModal.tsx` | `createLoad()` → POST /loads |
| Detail drawer | `components/DetailDrawer.tsx` | Shows load detail + AI analysis trigger |
| AI analysis modal | `components/LoadAnalysisModal.tsx` | Renders GO/PASS/NEGOTIATE result |
| API calls | `services/api.ts:185–226` | `listLoads`, `getLoad`, `createLoad`, `updateLoad`, `deleteLoad` |
| Backend route | `backend/app/loads/routes.py` | CRUD + document-requests + messages sub-routes |
| Financials | `backend/app/loads/routes.py:61–65` | `_compute_financials()` — net_profit, rpm, net_rpm |
| Auto-invoice | `backend/app/loads/routes.py:132–163` | Invoice auto-created on load insert (in-memory + DB) |
| In-memory store | `backend/app/loads/routes.py:19–21` | `_LOADS`, `_INVOICES` — fallback when RLS blocks |
| DB table | `loads` | Columns: id, organization_id, carrier_id, broker_id, route, origin/destination, load_rate, miles, fuel_cost, driver_pay, tolls, net_profit, rpm, net_rpm, status, pickup_date, delivery_date, rc_reference, customer_ap_email, deleted_at |

**Load statuses:** `logged` → (update via PATCH) → `in_transit`, `delivered`, `cancelled`

**Dependencies:** broker MC → `BrokerService.get_or_create_by_mc()` in `backend/app/brokers/service.py`

---

### LOADS — Carrier Portal

| Layer | File | Notes |
|-------|------|-------|
| List page | `FleetPulse/app/loads/page.tsx` | Carrier's own loads only (filtered by carrier_id) |
| Detail page | `FleetPulse/app/loads/[loadId]/page.tsx` | Full load detail + messages + doc requests |
| Components | `FleetPulse/components/LoadCard.tsx` | Load summary card |
| Components | `FleetPulse/components/MessageThread.tsx` | Dispatcher ↔ carrier messaging |
| Components | `FleetPulse/components/DocRequestItem.tsx` | Document request list item |
| Same API | `backend/app/loads/routes.py` | Shared backend, carrier role sees only their loads |

---

### DOCUMENT REQUESTS (sub-resource of Loads)

> **Removed from dispatcher UI.** Document requests are now handled via the Invoice and Carrier compliance flows. Backend routes remain for the Carrier Portal.

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts` | `listDocumentRequests`, `createDocumentRequest`, `updateDocumentRequest`, `deleteDocumentRequest` — no longer used in dispatcher loads page |
| Backend | `backend/app/loads/routes.py` | Sub-routes on `/loads/{load_id}/document-requests` — kept for carrier portal |
| DB table | `document_requests` | id, load_id, doc_type, label/notes, status, carrier_id |
| Carrier view | `FleetPulse/components/ComplianceDocRow.tsx` | Renders doc request in compliance page |

---

### MESSAGES (sub-resource of Loads)

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts:351–358` | `listMessages`, `sendMessage` |
| Backend | `backend/app/loads/routes.py:460–503` | Sub-routes on `/loads/{load_id}/messages` |
| DB table | `messages` | id, load_id, sender_id, sender_role, body |
| Carrier component | `FleetPulse/components/MessageThread.tsx` | Renders thread, handles send |

---

### INVOICES — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/invoices/page.tsx` | Lists, filters, actions |
| Row component | `components/InvoiceRow.tsx` | Invoice table row with actions |
| Follow-up modal | `components/FollowUpModal.tsx` | AI-drafted follow-up email (tone escalation) |
| Add modal | `components/AddInvoiceModal.tsx` | Manual invoice creation |
| API calls | `services/api.ts:230–280` | `listInvoices`, `createInvoice`, `getInvoice`, `markInvoicePaid`, `updateInvoice`, `deleteInvoice`, `sendInvoice` |
| Backend route | `backend/app/invoices/routes.py` | CRUD |
| Enrichment | `backend/app/invoices/routes.py:_enrich_invoices()` | Adds days_outstanding, carrier_name, broker_name |
| In-memory | `backend/app/invoices/routes.py:_get_invoices_mem()` | Imports `_INVOICES` from loads.routes |
| DB table | `invoices` | id, organization_id, load_id, carrier_id, broker_id, amount, status, followups_sent, invoice_number, issued_date, due_date, customer_ap_email, deleted_at |
| Trigger | `supabase/functions/invoice_on_load.sql` | DB-level auto-create on load insert |

**Invoice statuses:** `pending` → `sent` → `paid` / `overdue`
**Days outstanding:** computed from `issued_date` or load `delivery_date` vs today

---

### INVOICES — Carrier Portal

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(portal)/overview/invoices/page.tsx` | Carrier's own invoices |

---

### CARRIERS — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/carriers/page.tsx` | Roster with grid/list toggle |
| Add modal | `components/AddCarrierModal.tsx` | DOT lookup or manual creation |
| Detail drawer | `components/DetailDrawer.tsx` | Carrier detail panel |
| API calls | `services/api.ts:132–181` | `listCarriers`, `getCarrier`, `addCarrier`, `lookupDot`, `createCarrierManual`, `updateCarrier` |
| Backend route | `backend/app/carriers/routes.py` | CRUD + `/lookup` + `/manual` + compliance-documents + pending-actions |
| Backend service | `backend/app/carriers/service.py` | `CarrierService`, in-memory `_CARRIERS` fallback |
| FMCSA integration | `backend/app/fmcsa/cache.py` | `FmcsaCacheService` — DOT lookup with in-memory cache |
| DB table | `carriers` | id, organization_id, legal_name, dot_number, mc_number, status, contact_*, address, drivers, power_units, portal_status |
| localStorage | `services/api.ts:9–17` | `VIEW_KEY = 'fleetpulse:roster:view'` — grid/list preference |

**Carrier statuses:** `active`, `inactive`, `suspended`
**Portal status:** `invited`, `active`, `none` — controls carrier portal access

---

### COMPLIANCE DOCUMENTS (sub-resource of Carriers)

> **Note:** The dispatcher-side compliance management has been fully replaced by the CARRIER COMPLIANCE DOCUMENTS feature below. The legacy endpoints below still exist for the Carrier Portal read-only view.

| Layer | File | Notes |
|-------|------|-------|
| Legacy API calls | `services/api.ts` | `listComplianceDocs`, `listPendingActions` — no longer used in dispatcher UI |
| Legacy backend | `backend/app/carriers/routes.py` | `GET /carriers/{id}/compliance-documents`, `GET /carriers/{id}/pending-actions` — kept for carrier portal |
| Carrier page | `FleetPulse/app/compliance/page.tsx` | Carrier's own compliance view |
| Component | `FleetPulse/components/ComplianceDocRow.tsx` | Individual doc row |

---

### INSURANCE

| Layer | File | Notes |
|-------|------|-------|
| Dispatcher page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/insurance/page.tsx` | Insurance certificates list |
| Carrier page | `fleetpulse-dispatcher/frontend/app/(portal)/overview/insurance/page.tsx` | Carrier's own insurance |
| Backend route | `backend/app/insurance/routes.py` | CRUD for insurance certificates |
| DB table | `insurance` | id, carrier_id, type, policy_number, provider, expiry_date, status |

---

### AI — Load Analysis

| Layer | File | Notes |
|-------|------|-------|
| Trigger | `components/DetailDrawer.tsx` → `components/LoadAnalysisModal.tsx` | User clicks "Analyze" |
| API call | `services/api.ts:284–290` | `analyzeLoad(loadId, forceRefresh)` |
| Backend route | `backend/app/ai/routes.py:34–88` | `POST /ai/load/analyze` |
| AI service | `backend/app/ai/service.py` | `AIService.analyze_load()` — calls Anthropic Claude |
| Decision logic | `backend/app/ai/routes.py:82–86` | GO: net_rpm≥1.5 AND trust≥70 / PASS: net_rpm<1.0 OR trust<50 / NEGOTIATE: else |
| Budget guard | `backend/app/ops/` | `cost_guard` — monthly AI budget cap ($30 default) |
| Config | `backend/app/config.py` | `ANTHROPIC_KEY`, `ai_monthly_budget` setting |

---

### AI — Invoice Follow-up Email

| Layer | File | Notes |
|-------|------|-------|
| Trigger | `components/FollowUpModal.tsx` | User clicks "Draft Follow-up" on invoice |
| API call | `services/api.ts:298–303` | `draftFollowup(invoiceId, overrideTone?)` |
| Backend route | `backend/app/ai/routes.py:155–218` | `POST /ai/invoice/followup` |
| Tone service | `backend/app/invoices/service.py` | `InvoiceFollowupService.tone_for_days()` — polite→firm→assertive→final |
| AI service | `backend/app/ai/service.py` | `AIService.draft_followup()` — generates subject + body |
| Fallback | `backend/app/ai/routes.py:197–205` | Template-based draft if Claude fails |
| DB update | `backend/app/ai/routes.py:208` | Increments `invoices.followups_sent` |

---

### AI — Broker Scoring

| Layer | File | Notes |
|-------|------|-------|
| API call | `services/api.ts:291–294` | `scoreBroker(brokerId)` |
| Backend route | `backend/app/ai/routes.py:93–150` | `POST /ai/broker/score` |
| Broker service | `backend/app/brokers/service.py` | `BrokerService.get_or_create_by_mc()` |
| FMCSA | `backend/app/fmcsa/cache.py` | Refreshes broker FMCSA data if `force_fmcsa_refresh=true` |
| Score thresholds | `backend/app/ai/routes.py:130–135` | ≥70 GO / ≥50 NEGOTIATE / <50 CAUTION |
| DB table | `brokers` | id, mc_number, legal_name, trust_score, authority_status, operating_status, payment_days_avg, payment_days_p90, late_payment_rate, fraud_flags, fmcsa_last_pulled_at |

---

### BROKERS

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts:307–310` | `listBrokers()` |
| Backend route | (included via `BrokerService`, no dedicated router in main.py) | Managed through service layer |
| Backend service | `backend/app/brokers/service.py` | `BrokerService` — get_or_create_by_mc, in-memory cache |
| DB table | `brokers` | See AI — Broker Scoring above |

---

### FMCSA

| Layer | File | Notes |
|-------|------|-------|
| Cache service | `backend/app/fmcsa/cache.py` | `FmcsaCacheService` — in-memory cache, calls external FMCSA API |
| Used by | `carriers/routes.py` (DOT lookup), `ai/routes.py` (broker refresh) | |
| Fallback | Uses mock data if `FMCSA_API_KEY` not set | |

---

### FEEDBACK

| Layer | File | Notes |
|-------|------|-------|
| Component | `components/FeedbackWidget.tsx` | Floating feedback button (all pages) |
| API call | `services/api.ts:313–322` | `submitFeedback({category, description, page, severity})` |
| Backend route | `backend/app/feedback/routes.py` | `POST /feedback` |

---

### DASHBOARD — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/dashboard/page.tsx` | Aggregates loads, invoices, carriers |
| Data sources | `listLoads()`, `listInvoices()`, `listCarriers()` from `services/api.ts` | |

---

### DASHBOARD — Carrier Portal

| Layer | File | Notes |
|-------|------|-------|
| Page | `FleetPulse/app/dashboard/page.tsx` | Carrier's own dashboard |
| Navigation | `FleetPulse/components/NavBar.tsx` | Displays user email, logout |

---

### IFTA

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/ifta/page.tsx` | IFTA reporting |
| Component | `components/ComingSoon.tsx` | Phase 2 — not yet implemented |

---

---

### PAPERWORK / DOCUMENT UPLOAD (Invoice Magic Link)

| Layer | File | Notes |
|-------|------|-------|
| DB tables | `invoice_document_requests`, `invoice_documents` | Migration: `20260329_invoice_paperwork.sql` |
| Grants fix | — | Migration: `20260329_invoice_paperwork_grants.sql` — `GRANT ALL TO service_role` |
| Backend service | `backend/app/paperwork/service.py` | `PaperworkService` — create_request, get_request_by_token, upload_file, upload_file_direct, list_documents (signed URLs) |
| Backend routes | `backend/app/paperwork/routes.py` | 5 endpoints (see below) |
| Router registration | `backend/app/main.py` | `paperwork_router` included in api_v1 |
| API calls | `services/api.ts` | `requestPaperwork`, `validateUploadToken`, `uploadInvoiceFile`, `listInvoiceDocuments`, `uploadInvoiceFileDirect` |
| Public upload page | `app/(public)/upload/[token]/page.tsx` | Driver-facing, no auth required |
| Public layout | `app/(public)/layout.tsx` | Bare `<div>` wrapper — NOT html/body (avoids duplicate root layout) |
| Request modal | `components/PaperworkRequestModal.tsx` | Dispatcher creates request + copies link |
| Detail modal | `components/InvoiceDetailModal.tsx` | Tabbed: Details + Documents; upload toolbar (dispatcher direct upload) + Request from Driver |
| Invoices page | `app/(dispatcher)/invoices/page.tsx` | Uses InvoiceDetailModal |
| Storage bucket | Supabase Storage `invoice-documents` | Private bucket — must be created manually |
| Setting | `backend/app/config.py` | `dispatcher_url` — base URL for magic links |
| Env var | `DISPATCHER_URL` | Defaults to `http://localhost:3001` |

**API endpoints:**
- `POST /api/v1/paperwork/requests` — auth — create request, returns `{ magic_link, token, doc_types, expires_at }`
- `GET /api/v1/paperwork/upload/{token}` — **public** — validate token, returns invoice context
- `POST /api/v1/paperwork/upload/{token}/files` — **public** — multipart (file + doc_type)
- `POST /api/v1/paperwork/invoices/{id}/files` — dispatcher auth — direct upload (multipart)
- `GET /api/v1/paperwork/invoices/{id}/documents` — auth — returns `{ documents[], requests[] }`

**Token lifecycle:** UUID in DB → 72h expiry → status: `pending` → `fulfilled` / `expired`

**File storage path:** `{org_id}/{invoice_id}/{request_id}/{filename}` (token upload) or `{org_id}/{invoice_id}/direct/{filename}` (dispatcher upload)

**Valid doc_types:** `BOL`, `POD`, `RATE_CON`, `WEIGHT_TICKET`, `LUMPER_RECEIPT`, `INVOICE`, `OTHER`

---

### CARRIER COMPLIANCE DOCUMENTS (Magic Link + Direct Upload)

| Layer | File | Notes |
|-------|------|-------|
| DB table (enhanced) | `compliance_documents` | Migration `20260330_carrier_compliance.sql` adds: `issue_date`, `file_url`, `file_name`, `file_size`, `request_id`, `organization_id`, `uploaded_at` |
| DB table (new) | `carrier_document_requests` | Same migration — token, carrier_id, org_id, doc_types[], 72h expiry |
| Constraint fix | — | Migration `20260330_carrier_compliance_doctype_fix.sql` — drops old `doc_type_check`, adds one covering all types |
| Backend module | `backend/app/carrier_compliance/` | `__init__.py` + `service.py` + `routes.py` |
| Backend service | `backend/app/carrier_compliance/service.py` | `CarrierComplianceService` — create_request, get_request_by_token, upload_file, upload_file_direct, list_documents (signed URLs), _maybe_fulfill |
| Backend routes | `backend/app/carrier_compliance/routes.py` | 5 endpoints (see below) |
| Router registration | `backend/app/main.py` | `carrier_compliance_router` included in api_v1 |
| API calls | `services/api.ts` | `requestCarrierDocs`, `validateCarrierUploadToken`, `uploadCarrierFile`, `uploadCarrierFileDirect`, `listCarrierDocuments` |
| Public upload page | `app/(public)/carrier-upload/[token]/page.tsx` | Carrier/owner-facing; per-doc issue_date + expiry_date inputs |
| Compliance modal | `components/CarrierComplianceModal.tsx` | Central compliance hub: upload toolbar (doc_type + issue_date + expires_at + file), document list with expiry badges, open requests with Copy Link |
| Request modal | `components/CarrierDocumentRequestModal.tsx` | Checkbox doc type selector → generates magic link |
| Carriers page | `app/(dispatcher)/carriers/page.tsx` | Drawer Compliance section → "Manage Documents" button opens CarrierComplianceModal |
| Storage bucket | Supabase Storage `carrier-documents` | Private bucket — must be created manually |

**API endpoints:**
- `POST /api/v1/carrier-compliance/requests` — dispatcher auth — create magic link request
- `GET /api/v1/carrier-compliance/upload/{token}` — **public** — validate token, returns carrier context
- `POST /api/v1/carrier-compliance/upload/{token}/files` — **public** — multipart (file + doc_type + issue_date? + expires_at?)
- `POST /api/v1/carrier-compliance/carriers/{id}/documents` — dispatcher auth — direct upload
- `GET /api/v1/carrier-compliance/carriers/{id}/documents` — auth — returns `{ documents[], requests[] }`

**Token lifecycle:** same as invoice paperwork — UUID → 72h → pending / fulfilled / expired

**File storage paths:**
- Token upload: `{org_id}/{carrier_id}/{request_id}/{filename}`
- Direct upload: `{org_id}/{carrier_id}/direct/{filename}`

**Valid doc_types:** `MC_AUTHORITY`, `W9`, `VOID_CHECK`, `CARRIER_AGREEMENT`, `NOA`, `COI`, `CDL`, `OTHER`

**Expiry status logic (frontend):** expired if `expires_at < today`; expiring_soon if within 30 days; active otherwise

---

## Cross-Cutting Concerns

### Styling System
- Config: `FleetPulse/tailwind.config.ts` (carrier portal) — brand color palette
- Dispatcher app has its own `tailwind.config` (similar tokens)
- Key tokens: `brand-amber` (#F59E0B), `brand-surface` (#0D1318), `brand-slate` (#F0F6FC), `brand-danger`, `brand-success`, `brand-warning`
- `cn()` helper: `FleetPulse/lib/cn.ts` — clsx + tailwind-merge

### Error Handling
- Backend: global exception handler in `main.py:30–36` → returns `ResponseEnvelope` with `error_code: INTERNAL_ERROR`
- Backend: `safe_execute()` in `config.py` — wraps Supabase calls, handles RLS errors gracefully
- Frontend: `apiFetch` in `services/api.ts:92–98` — unwraps envelope, surfaces `.error` field

### In-Memory Fallbacks (MVP pattern)
- `_LOADS`, `_INVOICES` in `backend/app/loads/routes.py:19–21`
- `_CARRIERS` in `backend/app/carriers/service.py`
- All are module-level lists populated at runtime, lost on server restart
- Pattern: try Supabase → `except Exception` → use in-memory store

### Database Migrations (apply in order)
```
supabase/migrations/
  20260317_init_schema.sql                        ← base tables
  20260317_init_rls.sql                           ← RLS policies
  20260317_seed.sql                               ← test data
  20260318_expand_schema.sql                      ← schema additions
  20260319_*.sql                                  ← incremental fixes
  20260324_fix_invoice_defaults.sql
  20260329_invoice_paperwork.sql                  ← invoice_document_requests + invoice_documents
  20260329_invoice_paperwork_grants.sql           ← GRANT ALL TO service_role (critical)
  20260330_carrier_compliance.sql                 ← enhance compliance_documents + carrier_document_requests
  20260330_carrier_compliance_doctype_fix.sql     ← drop/replace doc_type CHECK constraint
```

### Supabase Client Rules
- `get_supabase()` — singleton, service role — use for all data ops
- `get_supabase_auth()` — fresh per call — use ONLY for sign-in/sign-up to prevent session contamination
- Both in `backend/app/config.py`
