# FleetPulse Codebase Connection Map

Use this file before any implementation task. Find the feature area, read only those files.
Update this map after any research phase that reveals new connections.

Last updated: 2026-03-31

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

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts:327–347` | `listDocumentRequests`, `createDocumentRequest`, `updateDocumentRequest`, `deleteDocumentRequest` |
| Backend | `backend/app/loads/routes.py:324–457` | Sub-routes on `/loads/{load_id}/document-requests` |
| DB table | `document_requests` | id, load_id, doc_type, label/notes, status, carrier_id |
| Valid doc_types | `backend/app/loads/routes.py:326` | `BOL`, `POD`, `RATE_CON`, `INVOICE`, `OTHER` |
| Valid statuses | `backend/app/loads/routes.py:327` | `approved`, `rejected` |
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

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts:363–398` | `listComplianceDocs`, `updateComplianceDoc`, `deleteComplianceDoc`, `listPendingActions` |
| Backend | `backend/app/carriers/routes.py` | `GET/PATCH/DELETE /carriers/{id}/compliance-documents`, `GET /carriers/{id}/pending-actions` |
| Inline edit UI | `app/(dispatcher)/carriers/page.tsx:424–490` | Pencil/Trash2 per row; edit doc_type, issued_at, expires_at |
| Carrier page | `FleetPulse/app/compliance/page.tsx` | Carrier's compliance view |
| Component | `FleetPulse/components/ComplianceDocRow.tsx` | Individual doc row |
| DB table | `compliance_documents` | id, carrier_id, doc_type (INSURANCE/CDL/REGISTRATION/INSPECTION/OTHER), label, storage_path, file_name, **issued_at** (date, added 20260331), expires_at (date), status, uploaded_at |
| Migration | `20260331_doc_date_fields.sql` | Adds `issued_at` to compliance_documents; adds `issued_at` + `expires_at` to invoice_documents |

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
| DB tables | `invoice_document_requests`, `invoice_documents` | Migration: `20260329_invoice_paperwork.sql`; `issued_at`/`expires_at` added via `20260331_doc_date_fields.sql` |
| Backend service | `backend/app/paperwork/service.py` | `PaperworkService` — create_request, get_request_by_token, upload_file, list_documents, **delete_document**, **update_document** |
| Backend routes | `backend/app/paperwork/routes.py` | 6 endpoints (see below) |
| Router registration | `backend/app/main.py` | `paperwork_router` included in api_v1 |
| API calls | `services/api.ts` (bottom of file) | `requestPaperwork`, `validateUploadToken`, `uploadInvoiceFile`, `listInvoiceDocuments`, **`updateInvoiceDocument`**, **`deleteInvoiceDocument`** |
| Public upload page | `fleetpulse-dispatcher/frontend/app/(public)/upload/[token]/page.tsx` | Driver-facing, no auth required |
| Public layout | `fleetpulse-dispatcher/frontend/app/(public)/layout.tsx` | Bare layout, no nav |
| Request modal | `components/PaperworkRequestModal.tsx` | Dispatcher creates request + copies link |
| Detail modal | `components/InvoiceDetailModal.tsx` | Tabbed: Details + Documents — inline edit (doc_type, issued_at, expires_at) + delete per doc |
| Invoices page | `app/(dispatcher)/invoices/page.tsx` | Uses InvoiceDetailModal |
| Storage bucket | Supabase Storage `invoice-documents` | Must be created manually in Supabase dashboard |
| Setting | `backend/app/config.py` | `dispatcher_url` — base URL for magic links |
| Env var | `DISPATCHER_URL` | Defaults to `http://localhost:3001` |

**API endpoints:**
- `POST /api/v1/paperwork/requests` — auth required — create request, returns `{ magic_link, token, doc_types, expires_at }`
- `GET /api/v1/paperwork/upload/{token}` — **public** — validate token, returns invoice context
- `POST /api/v1/paperwork/upload/{token}/files` — **public** — multipart upload (file + doc_type), returns doc record
- `GET /api/v1/paperwork/invoices/{id}/documents` — auth required — returns `{ documents[], requests[] }`
- `PATCH /api/v1/paperwork/invoices/{id}/documents/{doc_id}` — dispatcher — update doc_type, issued_at, expires_at
- `DELETE /api/v1/paperwork/invoices/{id}/documents/{doc_id}` — dispatcher — delete document record

**Token lifecycle:** UUID in DB → 72h expiry → status: `pending` → `fulfilled` (all docs uploaded) / `expired`

**File storage path:** `{org_id}/{invoice_id}/{request_id}/{filename}` in Supabase Storage bucket `invoice-documents`

**Valid doc_types:** `BOL`, `POD`, `RATE_CON`, `WEIGHT_TICKET`, `LUMPER_RECEIPT`, `INVOICE`, `OTHER`

---

## Cross-Cutting Concerns

### Styling System
- Config: `FleetPulse/tailwind.config.ts` (carrier portal) — brand color palette
- Dispatcher app has its own `tailwind.config` (similar tokens)
- Key tokens: `brand-amber` (#F59E0B), `brand-surface` (#0D1318), `brand-slate` (#F0F6FC), `brand-danger`, `brand-success`, `brand-warning`
- `cn()` helper: `FleetPulse/lib/cn.ts` — clsx + tailwind-merge
- Icons: `components/icons/index.tsx` — custom SVG set; includes Pencil, Trash2 (added 2026-03-31)

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
  20260317_init_schema.sql      ← base tables
  20260317_init_rls.sql         ← RLS policies
  20260317_seed.sql             ← test data
  20260318_expand_schema.sql    ← schema additions
  20260319_*.sql                ← incremental fixes
  20260324_fix_invoice_defaults.sql
```

### Supabase Client Rules
- `get_supabase()` — singleton, service role — use for all data ops
- `get_supabase_auth()` — fresh per call — use ONLY for sign-in/sign-up to prevent session contamination
- Both in `backend/app/config.py`
