# CLAUDE.md — FleetPulse Codebase Guide

This document is for AI assistants working in this repository. It covers structure, conventions, workflows, and key patterns.

---

## Project Overview

FleetPulse is a **unified freight dispatch and carrier management platform** for trucking companies. It has two user-facing applications sharing a single backend:

| App | Path | Port | Purpose |
|-----|------|------|---------|
| Carrier Portal | `FleetPulse/` | 3000 | Self-service for carriers: view loads, upload docs, message dispatchers |
| Dispatcher Command Center | `fleetpulse-dispatcher/frontend/` | 3001 | Dashboard for dispatchers: manage carriers, loads, invoices, AI-assisted decisions |
| Backend API | `fleetpulse-dispatcher/backend/` | 8000 | FastAPI serving both frontends |

---

## Tech Stack

### Frontend (both apps)
- **Next.js 14** (App Router) + **React 18** + **TypeScript 5**
- **Tailwind CSS 3** with custom `brand-*` color tokens
- **Supabase** Auth Helpers + Realtime JS
- **Lucide React** icons
- **clsx** + **tailwind-merge** for conditional classes

### Backend
- **FastAPI 0.116** + **Python 3.13** + **Uvicorn**
- **Supabase** (PostgreSQL via PostgREST) + **SQLAlchemy**
- **Pydantic v2** for validation/settings
- **Anthropic Claude API** for load analysis and email generation
- **python-jose** for JWT validation
- **httpx** for async HTTP calls

### Testing
- Backend: **Pytest** with mock Supabase client
- Frontend: **Playwright** E2E tests

### Deployment
- Backend: **Heroku** (`Procfile`)
- Frontend: **Vercel** (implied)

---

## Repository Structure

```
FleetPulse/
├── FleetPulse/                        # Carrier Portal (Next.js 14)
│   ├── app/                           # Next.js App Router pages
│   │   ├── auth/                      # Login + OAuth callback
│   │   ├── dashboard/                 # Carrier dashboard
│   │   ├── loads/                     # Load listing + detail
│   │   └── compliance/                # Document compliance view
│   ├── components/                    # Shared React components
│   ├── lib/                           # Supabase clients, types, utils
│   │   ├── supabase-server.ts         # Server-side Supabase client
│   │   ├── supabase.ts                # Browser Supabase client
│   │   ├── types.ts                   # TypeScript types
│   │   └── cn.ts                      # clsx + tailwind-merge helper
│   ├── supabase/                      # DB migrations & functions
│   ├── middleware.ts                  # Auth guard (redirects to /auth/login)
│   ├── next.config.mjs                # 8MB server action body limit
│   ├── tailwind.config.ts             # Brand color palette
│   └── .env.example                   # Required env vars
│
└── fleetpulse-dispatcher/
    ├── frontend/                      # Dispatcher App (Next.js 14)
    │   ├── app/
    │   │   ├── (auth)/                # Login/signup pages
    │   │   ├── (dispatcher)/          # Dispatcher routes
    │   │   │   ├── dashboard/
    │   │   │   ├── loads/
    │   │   │   ├── invoices/
    │   │   │   ├── carriers/
    │   │   │   ├── insurance/
    │   │   │   └── ifta/
    │   │   └── (portal)/              # Carrier-facing routes in dispatcher app
    │   ├── components/                # Modals + specialized components
    │   ├── services/
    │   │   └── api.ts                 # Centralized fetch wrapper (apiFetch)
    │   ├── tests/                     # Playwright E2E tests
    │   └── playwright.config.ts
    │
    ├── backend/                       # FastAPI Backend
    │   ├── app/
    │   │   ├── main.py                # FastAPI app + router registration
    │   │   ├── config.py              # Settings, Supabase clients, helpers
    │   │   ├── auth/                  # Auth routes + service
    │   │   ├── carriers/              # Carrier CRUD
    │   │   ├── loads/                 # Load management
    │   │   ├── invoices/              # Invoice processing
    │   │   ├── insurance/             # Insurance certificates
    │   │   ├── brokers/               # Broker data + trust scores
    │   │   ├── ai/                    # Claude AI integration
    │   │   ├── fmcsa/                 # FMCSA API client + caching
    │   │   ├── feedback/              # User feedback
    │   │   ├── common/                # ResponseEnvelope schema
    │   │   ├── middleware/            # JWT auth middleware
    │   │   └── ops/                   # cost_guard and ops logic
    │   ├── tests/
    │   │   ├── conftest.py            # Mock Supabase fixtures
    │   │   ├── contract/              # Unit tests
    │   │   └── integration/           # Integration tests
    │   ├── requirements.txt
    │   ├── Procfile                   # heroku: uvicorn app.main:app
    │   └── .env.example
    │
    └── supabase/
        ├── migrations/                # Timestamped SQL migrations
        │   ├── 20260317_init_schema.sql
        │   ├── 20260317_init_rls.sql
        │   ├── 20260317_seed.sql      # Test data
        │   ├── 20260318_expand_schema.sql
        │   └── 20260319_*.sql         # Further schema evolution
        └── functions/
            ├── invoice_on_load.sql    # Auto-creates invoice on load insert
            └── recompute_irs_on_change.sql
```

---

## Development Setup

### Carrier Portal
```bash
cd FleetPulse
npm install
cp .env.example .env.local   # Fill in NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm run dev                  # http://localhost:3000
```

### Dispatcher Frontend
```bash
cd fleetpulse-dispatcher/frontend
npm install
cp .env.local.example .env.local   # Set NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
npm run dev                        # http://localhost:3001
```

### Backend
```bash
cd fleetpulse-dispatcher/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # Fill in keys (see Environment Variables)
uvicorn app.main:app --reload --port 8000
```

### Database Migrations
Apply SQL files in `fleetpulse-dispatcher/supabase/migrations/` in chronological order via the Supabase dashboard or Supabase CLI (`supabase migration up`).

---

## Environment Variables

### Carrier Portal (`FleetPulse/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Dispatcher Frontend (`fleetpulse-dispatcher/frontend/.env.local`)
```
NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
```

### Backend (`fleetpulse-dispatcher/backend/.env`)
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJ...service-role-key...    # Must be service role, NOT anon key
JWT_SECRET=your-jwt-secret-from-dashboard

# Optional
ANTHROPIC_KEY=sk-xxxx          # For AI load analysis + email generation
SENDGRID_KEY=SG.xxxx           # Phase 2 (not yet integrated)
FMCSA_API_KEY=xxxxx            # Carrier lookups (uses mock data if absent)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
CARRIER_PORTAL_URL=http://localhost:3000
```

---

## Running Tests

### Backend (Pytest)
```bash
cd fleetpulse-dispatcher/backend
pytest tests/                    # All tests
pytest tests/contract/           # Unit tests only
pytest tests/integration/        # Integration tests only
```
Tests use a mock Supabase client (`conftest.py`) — no live database required.

### Frontend E2E (Playwright)
```bash
cd fleetpulse-dispatcher/frontend
npm run dev &                    # Must be running
npx playwright test              # Headless
npx playwright test --headed     # With browser UI
```

---

## Coding Conventions

### Frontend (TypeScript/React)

- **Components**: PascalCase files and exports (`LoadCard.tsx`, `DetailDrawer`)
- **Functions/variables**: camelCase (`handleSubmit`, `fetchAll`)
- **Constants**: UPPER_SNAKE_CASE (`VIEW_KEY`, `TOKEN_KEY`)
- **Server vs Client**: Default to server components; add `"use client"` only when using `useState`, `useEffect`, or browser events
- **Styling**: Tailwind with `brand-*` tokens (see tailwind.config.ts). Use `cn()` from `lib/cn.ts` for conditional classes
- **Path alias**: Use `@/` (e.g., `@/components/NavBar`, `@/lib/types`)
- **API calls**: Always go through `services/api.ts` → `apiFetch()`. Never use raw `fetch` directly in components
- **Auth tokens**: Stored in `localStorage` under `TOKEN_KEY`; cleared on logout

### Backend (Python/FastAPI)

- **Modules**: One directory per domain (`carriers/`, `loads/`, etc.), each with `routes.py` + `service.py`
- **Classes**: PascalCase (`AuthService`, `LoadService`)
- **Functions/variables**: snake_case (`create_load`, `get_settings`)
- **Pydantic models**: Use `*In` suffix for input models, `*Out` for output (e.g., `LoadIn`, `LoadOut`)
- **All routes return**: `ResponseEnvelope` from `app/common/`
  ```python
  { "data": <T>, "error": null | str, "error_code": str | null, "meta": {...} }
  ```
- **Database access**: Use `get_supabase()` for queries; `get_supabase_auth()` for sign-in/sign-up (fresh instance each time)
- **RLS errors**: Use `safe_execute()` and `safe_maybe_single()` from `config.py` to gracefully handle PostgREST permission errors
- **Auth**: Protect routes with `require_dispatcher` or `require_authenticated` decorators from the middleware module

### Database (Supabase/PostgreSQL)

- Migrations are timestamped SQL files, applied in order
- All tables have Row-Level Security (RLS) policies
- Triggers auto-create invoices on load insert (`invoice_on_load.sql`)
- Never bypass RLS — use service role only for admin operations

---

## Key Architecture Patterns

### 1. Response Envelope
All API responses are wrapped:
```json
{ "data": {...}, "error": null, "meta": { "version": "1.0" } }
```
On error: `{ "data": null, "error": "message", "error_code": "CODE" }`

### 2. AI Load Analysis (Claude)
Located in `backend/app/ai/`. Decision logic:
- **GO**: `net_rpm >= 1.50` AND `broker_trust >= 70`
- **PASS**: `net_rpm < 1.00` OR `broker_trust < 50`
- **NEGOTIATE**: everything else (AI calculates target rate)

Financial formulas:
```
net_profit = rate - driver_pay - fuel_cost - tolls
rpm        = rate / miles
net_rpm    = net_profit / miles
```

Uses Anthropic prompt caching. Budget cap: `ai_monthly_budget = 30.0` USD (configurable).

### 3. Mock-First Data Fallback
When Supabase RLS blocks access, in-memory dicts (`_LOADS`, `_INVOICES`) serve as fallback. This enables MVP operation without perfect DB setup. See `config.py`.

### 4. Supabase Client Singleton
- `get_supabase()` → singleton service-role client for data operations
- `get_supabase_auth()` → fresh instance per auth operation (prevents session contamination)

### 5. Auth Flow
- **Carrier Portal**: Supabase Auth Helpers + `middleware.ts` redirects unauthenticated users to `/auth/login`
- **Dispatcher**: JWT stored in localStorage; `apiFetch()` injects `Authorization: Bearer <token>` on every request; 401 responses redirect to login

### 6. Real-Time Updates
Supabase Realtime subscriptions are set up in components that need live updates (loads, messages). Not fully utilized in current MVP.

### 7. Email Generation (Phase 2)
`FollowUpModal` uses Claude to draft invoice follow-up emails with tone escalation: polite → firm → assertive → final. SendGrid integration is stubbed but not wired.

---

## Core Database Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Company accounts |
| `users` | Team members (dispatcher or carrier role) |
| `carriers` | Trucking companies (DOT/MC numbers) |
| `loads` | Freight shipments |
| `invoices` | Auto-created from loads, tracks payment status |
| `brokers` | Freight brokers with trust scores |
| `insurance` | Carrier insurance certificates |

---

## Common Pitfalls

1. **Never use the anon key for the backend** — `SUPABASE_KEY` must be the service role key.
2. **204 responses from PostgREST** (no rows found) are monkey-patched in `config.py` to return empty results rather than errors.
3. **`"use client"` directive** — only add when the component truly needs browser APIs. Unnecessary use breaks SSR optimizations.
4. **Migrations must run in order** — the schema is cumulative; skipping a file will break later ones.
5. **CORS_ORIGINS** — must include both frontend origins (3000 and 3001) when running locally.
6. **Playwright tests** require the dev server to already be running (`npm run dev`) before executing.

---

## Branch & Git Conventions

- Active development branch: `claude/add-claude-documentation-aOq5O`
- GitHub repo: `luis071727/fleetpulse`
- Commit messages: imperative mood, concise (`Add load analysis AI endpoint`, `Fix invoice RLS policy`)
