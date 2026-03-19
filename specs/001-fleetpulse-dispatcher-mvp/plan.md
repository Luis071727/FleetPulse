# Implementation Plan: FleetPulse AI — Dispatcher MVP + Insurance Intelligence

**Branch**: `001-fleetpulse-dispatcher-mvp` | **Date**: 2026-03-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-fleetpulse-dispatcher-mvp/spec.md`

## Summary

FleetPulse AI is a vertical SaaS platform for the 3.5M+ small US trucking carriers (1–20 trucks). **Phase 1 builds the Dispatcher Command Center** (full fleet management) and **Carrier Self-Service Portal** (read-only), sharing a single FastAPI backend. Phase 1 establishes the core: carrier roster with FMCSA integration, load logging, invoice tracking, and AI-powered load and invoice recommendations. **Phase 2 (Insurance Readiness Scoring and playbook generation) is scoped separately and will proceed after Phase 1 gate validation.** The dispatcher is the primary user and distribution channel; carriers are secondary users and upgrade revenue. Gate: dispatcher can add a real carrier, log a load, and view the invoice.

## Technical Context

**Language/Version**: Python 3.12  
**Primary Dependencies**: FastAPI (web framework), Supabase SDK (auth + database + realtime), Anthropic SDK (Claude API), sqlalchemy (ORM), pydantic (validation)  
**Storage**: PostgreSQL (via Supabase) with Row-Level Security, 24h FMCSA cache tables, soft deletes only  
**Testing**: pytest (unit), pytest + TestClient (integration), contract tests via JSON schema  
**Target Platform**: Web service (Linux/Railway backend) + Next.js 14 frontend (Vercel)  
**Project Type**: Web service (SaaS platform)  
**Performance Goals**: <30/month total infrastructure cost at MVP; FMCSA/AI calls within 15s; invoice urgency badges < 500ms  
**Constraints**: Multi-tenant isolation via RLS (NON-NEGOTIABLE per Constitution III), all AI calls server-side only, prompt caching ≥60% hit rate, soft deletes, timestamptz UTC, uuid PKs, snake_case columns  
**Scale/Scope**: Phase 1-2 feature set; 2 distinct frontend apps (dispatcher + carrier) sharing 1 backend; 7 carriers + 1 dispatcher seed data; ~40 API endpoints across 5 domains (auth, carriers, loads, invoices, AI)

## Constitution Check

*GATE: All items below MUST pass before Phase 0 research begins.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. Dispatcher-Led Architecture | Dispatcher is primary user; two distinct frontends proposed (Command Center + Portal); carrier portal is invite-only | ✅ PASS |
| II. Immutable Tech Stack | Spec assumes Python 3.12 + FastAPI + Supabase + Claude Sonnet + Tailwind; no substitutions proposed | ✅ PASS |
| III. Data Security (NON-NEGOTIABLE) | RLS on all tables, soft deletes, multi-tenant via org_id, all AI server-side, FMCSA cache 24h, JWT auth | ✅ PASS |
| IV. Phase-Gated Build | Spec covers Phase 1 (Weeks 1-7) + Phase 2 (Weeks 8-12); no Phase 3+ features (ELD, Embark) implemented | ✅ PASS |
| V. AI Integrity | All AI calls server-side only; structured JSON responses; prompt caching enabled; 4 canonical endpoints | ✅ PASS |

**GATE RESULT**: ✅ **PASS** — All constitutional principles satisfied. Proceed to research.

## Project Structure

### Documentation (this feature)

```text
specs/001-fleetpulse-dispatcher-mvp/
├── spec.md                          # Feature specification (completed, clarified)
├── plan.md                          # This file (in-progress)
├── research.md                      # Phase 0 output (TBD: resolve unknowns)
├── data-model.md                    # Phase 1 output (TBD: schema + RLS policies)
├── quickstart.md                    # Phase 1 output (TBD: MVP setup guide)
├── contracts/                       # Phase 1 output (TBD: API contract specs)
│   ├── auth.json                    # Auth endpoints: signup, login, invite
│   ├── carriers.json                # Carrier roster, add, detail endpoints
│   ├── loads.json                   # Load CRUD endpoints
│   ├── invoices.json                # Invoice tracker endpoints
│   └── ai.json                      # 4 AI endpoints: load/analyze, broker/score, invoice/followup, insurance/playbook
└── checklists/                      # Quality gates
    └── requirements.md              # Pre-planning validation (completed)
```

### Source Code (repository root)

```text
fleetpulse-dispatcher/          # Full-stack monorepo
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, route setup, startup
│   │   ├── config.py                # Environment, Supabase client, secrets
│   │   ├── auth/
│   │   │   ├── models.py            # User, Organization, Role enums
│   │   │   ├── service.py           # Signup, login, invite logic
│   │   │   └── routes.py            # /api/v1/auth/* endpoints
│   │   ├── carriers/
│   │   │   ├── models.py            # Carrier schema, pydantic
│   │   │   ├── service.py           # FMCSA lookup, cache, status compute
│   │   │   └── routes.py            # /api/v1/carriers/* endpoints
│   │   ├── loads/
│   │   │   ├── models.py            # Load, Invoice schemas
│   │   │   ├── service.py           # Load creation, invoice auto-create, profit calc
│   │   │   └── routes.py            # /api/v1/loads/* endpoints
│   │   ├── invoices/
│   │   │   ├── models.py            # Invoice schema
│   │   │   ├── service.py           # Invoice queries, days_outstanding compute
│   │   │   └── routes.py            # /api/v1/invoices/* endpoints
│   │   ├── brokers/
│   │   │   ├── models.py            # Broker schema
│   │   │   ├── service.py           # FMCSA broker lookup, initial trust score
│   │   │   └── routes.py            # /api/v1/brokers/* (read-only)
│   │   ├── ai/
│   │   │   ├── models.py            # Request/response schemas
│   │   │   ├── service.py           # Claude calls, prompt caching, structured JSON
│   │   │   └── routes.py            # /api/v1/ai/* endpoints (4 types)
│   │   ├── fmcsa/
│   │   │   ├── cache.py             # FMCSA cache table ops
│   │   │   └── client.py            # SAFER API client wrapper
│   │   └── middleware/
│   │       ├── auth.py              # JWT validation, RLS enforcement
│   │       └── error.py             # Global error handling, 404/500 logic
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── test_auth.py
│   │   │   ├── test_carriers.py
│   │   │   ├── test_loads.py
│   │   │   ├── test_invoices.py
│   │   │   ├── test_ai.py
│   │   │   └── test_fmcsa_cache.py
│   │   ├── integration/
│   │   │   ├── test_carrier_roster.py
│   │   │   ├── test_load_invoice_flow.py
│   │   │   └── test_ai_recommendations.py
│   │   └── contract/
│   │       ├── test_auth_contract.py
│   │       ├── test_carrier_contract.py
│   │       ├── test_load_contract.py
│   │       └── test_ai_contract.py
│   ├── requirements.txt
│   ├── .env.example
│   └── run.sh
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx               # Root layout, theme provider
│   │   ├── page.tsx                 # Home / dispatcher login redirect
│   │   └── (auth)/
│   │       ├── signup/page.tsx
│   │       └── login/page.tsx
│   │   └── (dispatcher)/
│   │       ├── carriers/
│   │       │   ├── [id]/page.tsx    # Carrier detail (opens detail drawer)
│   │       │   └── page.tsx         # Carrier roster grid/list
│   │       ├── loads/
│   │       │   └── page.tsx         # Load list with LogLoadModal
│   │       ├── invoices/
│   │       │   ├── [id]/page.tsx    # Invoice detail
│   │       │   └── page.tsx         # Invoice tracker
│   │       └── insurance/           # Phase 2
│   │           └── page.tsx         # Insurance IQ tab
│   │   └── (portal)/
│   │       ├── layout.tsx           # Portal layout (different nav)
│   │       ├── accept-invite/
│   │       │   └── page.tsx         # Carrier password set flow
│   │       └── overview/
│   │           ├── page.tsx         # Carrier portal Overview tab
│   │           ├── loads/
│   │           │   └── page.tsx     # Carrier's My Loads (read-only)
│   │           └── invoices/
│   │               └── page.tsx     # Carrier's Invoices (read-only)
│   ├── components/
│   │   ├── CarrierCard.tsx
│   │   ├── DetailDrawer.tsx
│   │   ├── AddCarrierModal.tsx
│   │   ├── LogLoadModal.tsx
│   │   ├── LoadAnalysisModal.tsx
│   │   ├── LoadItem.tsx
│   │   ├── InvoiceRow.tsx
│   │   ├── FollowUpModal.tsx
│   │   ├── Sidebar.tsx
│   │   ├── TopNav.tsx
│   │   └── common/
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       └── Input.tsx
│   ├── services/
│   │   └── api.ts                   # Fetch wrapper, auth token mgmt
│   ├── styles/
│   │   └── globals.css              # Tailwind setup, dark theme tokens
│   ├── public/
│   │   └── icons/                   # SVG icon set
│   ├── tests/
│   │   └── components/
│   │       └── CarrierCard.test.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   └── .env.local.example
│
├── supabase/
│   ├── migrations/
│   │   ├── 20260317_init_schema.sql # Organizations, users, carriers, loads, invoices, brokers, FMCSA cache tables + RLS policies
│   │   ├── 20260317_init_rls.sql    # All RLS enforcement rules
│   │   └── 20260317_seed.sql        # Seed: 1 org, 1 dispatcher, 7 carriers
│   └── functions/                   # Optional: Postgres functions for compute (e.g., carrier status)
│
└── README.md
```

## Complexity Tracking

No violations of Constitution detected. All design decisions align with Principles I–V. No exceptions needed.

---

## Phase 0: Research & Unknowns Resolution

**Purpose**: Identify and resolve all technical unknowns before design.

### Research Tasks

Task 1: FMCSA SAFER API integration patterns

Task 2: Supabase RLS policy syntax and performance at scale (100+ carriers, 1000+ loads)

Task 3: Claude prompt caching implementation in FastAPI (token counting, cache control headers)

Task 4: Next.js 14 + Tailwind dark mode theme setup for design system tokens

Task 5: Supabase Auth magic link customization (email template, redirect URL handling)

Task 6: PostgreSQL `generated_always_as` for days_outstanding computation (vs calculated in application layer)

Task 7: Best practices for storing Anthropic API responses (JSON validation, schema versioning)

Task 8: Vercel + Railway free tier limits and cost tracking implications

**Deliverable**: `research.md` consolidating findings with decision rationale for each task.

---

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` and constitution context loaded.

### Artifacts to Generate

**1. data-model.md** — Database Schema & RLS Policies

- All 10 key entities with field definitions, types, constraints
- relationships (foreign keys, one-to-many, many-to-many)
- Computed columns (days_outstanding, carrier status, IRS sub-scores)
- RLS policies for each table: dispatcher access pattern, carrier access pattern
- Indexes for query performance (carrier.dot_number, invoice.days_outstanding, load.carrier_id)
- Soft-delete triggers and views

**2. contracts/** — API Contract Specifications

```
contracts/
├── auth.json         # POST /auth/signup, POST /auth/login, POST /auth/invite/carrier
├── carriers.json     # GET /carriers, POST /carriers, GET /carriers/{id}, PATCH /carriers/{id}
├── loads.json        # GET /loads, POST /loads, PATCH /loads/{id}
├── invoices.json     # GET /invoices, PATCH /invoices/{id}
├── brokers.json      # GET /brokers (read-only), GET /brokers/{mc}
├── ai.json           # POST /ai/load/analyze, POST /ai/broker/score, POST /ai/invoice/followup, POST /ai/insurance/playbook
└── fmcsa.json        # GET /fmcsa/carrier/{dot}, GET /fmcsa/broker/{mc}
```

Each contract specifies:
- Request body schema (pydantic model as JSON)
- Response schema (success + error cases)
- HTTP status codes (201, 200, 400, 404, 500)
- RLS enforcement notes
- Example curl commands

**3. quickstart.md** — MVP Setup & Deployment Guide

- Local development environment setup (Python venv, npm, Supabase CLI)
- Environment variables (.env.local template)
- Running backend on `http://localhost:8000`
- Running frontend on `http://localhost:3000`
- Seeding test data (migrating schema + seed script)
- Running tests (unit, integration, contract)
- Deploying to Railway (backend) and Vercel (frontend)
- Cost tracking checklist (verify <$30/month)

### Agent Context Update

Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType copilot` to encode new technology decisions (Python 3.12 + FastAPI + Supabase + Claude Sonnet, RLS constraints, soft-delete policy) into the agent-specific context for all downstream commands in this session.

### Constitution Re-check (Post-Design)

| Principle | Check | Status |
|-----------|-------|--------|
| I. Dispatcher-Led | Two frontends scoped, invite-only portal, dispatcher centric | ✅ PASS |
| II. Tech Stack Locked | No substitutions proposed; stack fully specified | ✅ PASS |
| III. Data Security | RLS on all 10 tables, soft deletes, timestamptz, uuid PKs per spec | ✅ PASS |
| IV. Phase-Gated | Phase 1 features only; Phase 2 (IRS engine) scoped separately; Phase 3+ deferred | ✅ PASS |
| V. AI Integrity | 4 endpoint structure locked; server-side only; structured JSON; prompt caching framework designed | ✅ PASS |

**GATE RESULT**: ✅ **PASS** — Design maintains integrity. Ready for Phase 2 (task generation).

---

## Phase 2: Task Generation

**Input**: Completed `spec.md`, `plan.md`, `data-model.md`, `contracts/`, `research.md`

**Output**: `tasks.md` with ordered, dependency-linked tasks for Phase 1 and Phase 2 implementation

**Note**: Task generation is delegated to `/speckit.tasks` command, which will process user stories from `spec.md` and create a complete task list with:
- Phase 0 (Setup): Project structure, dependencies, CI/CD
- Phase 1 (Foundational): Database schema + RLS, auth endpoints, FMCSA integration
- Phase 1 (User Stories): Carrier roster (P1), load logging (P3), invoice tracking + AI (P4-P5), portal invite (P6)
- Phase 2 (User Stories): Insurance IQ tab (P7), IRS scoring + playbook (P7)
- All integration + contract tests

---

## Summary of Deliverables

| Artifact | Owner | Status | Next |
|----------|-------|--------|------|
| spec.md | Specification phase | ✅ Complete & clarified | → plan.md |
| plan.md | Planning phase | 🟡 In-progress (this file) | → Phase 0 research |
| research.md | Phase 0 research | ⏳ TBD (after Phase 0) | → data-model.md |
| data-model.md | Phase 1 design | ⏳ TBD | → contracts/ |
| contracts/ | Phase 1 design | ⏳ TBD | → quickstart.md |
| quickstart.md | Phase 1 design | ⏳ TBD | → tasks.md |
| tasks.md | Phase 2 (speckit.tasks) | ⏳ TBD | → Implementation |

---

## Next Steps

1. **Phase 0 Research**: Respond to the 8 research questions in this plan and consolidate findings into `research.md` with decision rationale for each unknown.
2. **Phase 1A Design**: Generate `data-model.md` with all 10 entity schemas, RLS policies, and indexes.
3. **Phase 1B Design**: Generate `contracts/` directory with 7 API contract JSON specs.
4. **Phase 1C Design**: Generate `quickstart.md` with setup, deploy, cost checklist.
5. **Agent Context**: Run `update-agent-context.ps1` to encode new technology decisions.
6. **Phase 2 Tasks**: Run `/speckit.tasks` to generate ordered task list with dependencies.
