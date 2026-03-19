<!--
SYNC IMPACT REPORT
==================
Version change:    unversioned (template) → 1.0.0
Bump rationale:    Initial ratification — all content is new (MAJOR: first adoption)

Modified principles:
  (none — initial ratification, no prior principles)

Added sections:
  - Core Principles (I–V)
  - Technical Conventions
  - Business Logic & Pricing
  - Governance

Removed sections:
  (none — initial ratification)

Templates reviewed for consistency:
  ✅ .specify/templates/plan-template.md      — Constitution Check gate is generic; no update needed
  ✅ .specify/templates/spec-template.md      — No constitution-specific references; aligns with principles
  ✅ .specify/templates/tasks-template.md     — Phase/story structure aligns with Phase-Gated principle
  ✅ .specify/templates/constitution-template.md — Source template; no edits required

Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Original adoption date unknown; set to first-fill date 2026-03-17
  - TODO(TERMINAL_API_PRICING): Confirm Terminal API exact pricing before Phase 3 commit
  - TODO(PARTNER_AGREEMENT): Dispatcher partner agreement structure (equity vs. revenue share only) not finalized
  - TODO(FACTORING_INTEGRATION): Factoring company integration deferred to Phase 4+ — not yet decided
-->

# FleetPulse AI Constitution

## Core Principles

### I. Dispatcher-Led Product Architecture

FleetPulse AI is built dispatcher-first. The dispatcher is the primary user,
the primary distribution channel, and the economic engine of the product.

- The product MUST have two distinct front-end applications sharing one backend:
  the Dispatcher Command Center (full fleet management) and the Carrier
  Self-Service Portal (read-only personal dashboard).
- Every feature MUST be evaluated for dispatcher value before carrier value.
- Carrier portal access is invite-only — dispatchers send the invite.
- The carrier is a secondary user and an upgrade revenue opportunity, not a
  growth-loop or acquisition target in Phase 1–3.
- GTM entry point is the dispatcher. Direct-to-carrier cold outreach is NOT
  the go-to-market strategy.

### II. Immutable Technology Stack

The technology stack is locked. No component may be substituted without
explicit written approval.

- **Frontend**: Next.js 14 + Tailwind CSS — hosted on Vercel (free tier)
- **Backend**: Python 3.12 + FastAPI — hosted on Railway (free tier)
- **Database**: Supabase (PostgreSQL) — Auth + RLS + Realtime included
- **AI Engine**: Anthropic Claude Sonnet — model `claude-sonnet-4-20250514`
  (always Sonnet; never Haiku or Opus without explicit approval)
- **ELD Data**: Terminal API (withterminal.com) — Phase 3 only
- **MVR Monitor**: Embark Safety or Verified Credentials — Phase 2 only
- **PSP Reports**: FMCSA PSP Program — $10/pull on demand
- **Public Data**: FMCSA SAFER API — free, MUST be cached 24 h in Supabase
- **SMS**: Twilio | **Email**: SendGrid | **Payments**: Stripe (Checkout + webhooks)
- Target infrastructure cost at MVP: under $30/month. Any vendor addition that
  breaks this ceiling MUST be flagged before implementation.

### III. Data Security & Access Control (NON-NEGOTIABLE)

Every data access decision MUST enforce multi-tenant isolation and auditability.

- Row-Level Security (RLS) MUST be enabled on every Supabase table — no
  exceptions, no bypass, even for internal tooling or admin scripts.
- `dispatcher_admin` sees all rows `WHERE organization_id = their org`.
- `carrier_*` roles see ONLY their own rows `WHERE carrier_id = their id`.
- Soft deletes ONLY — carrier and load records MUST NEVER be hard-deleted.
- All timestamps MUST be `timestamptz DEFAULT now()` in UTC.
- All primary keys MUST be `uuid DEFAULT gen_random_uuid()`.
- Column naming MUST be `snake_case` throughout.
- All AI calls MUST be server-side only (FastAPI). The Claude API key MUST
  NEVER be exposed to or called from the frontend under any circumstances.
- FMCSA SAFER responses MUST be cached in `fmcsa_cache` for 24 h — the same
  DOT number MUST NEVER trigger two live FMCSA calls within the cache window.

### IV. Phase-Gated Build Discipline

The build sequence is fixed. Phases MUST NOT be skipped or reordered.
Phase N+1 MUST NOT begin until the Phase N gate is explicitly passed.

- **Phase 1** (Weeks 1–7): Dispatcher Command Center
  - Gate: dispatcher can add a real carrier and view their loads.
- **Phase 2** (Weeks 8–12): Insurance Intelligence
  - IRS scoring, driver profiles, MVR integration, AI playbook, DataQs.
- **Phase 3** (Weeks 13–16): HOS Compliance + ELD
  - Terminal API OAuth, HOS monitoring, Twilio SMS alerts.
- **Phase 4** (Weeks 17–20): Billing + Growth
  - Stripe subscriptions, carrier upgrade flow, analytics/reports.
- Current phase: **Phase 1, Week 1**.
- Features belonging to a future phase MUST NOT be implemented, stubbed, or
  wired up until that phase's gate is active.

### V. AI Integrity & Structured Responses

All AI functionality MUST follow strict server-side, structured-output rules.

- All Claude calls MUST originate from FastAPI endpoints only — never from
  the browser or any client-side code.
- All AI responses MUST be structured JSON — no markdown fences, no preamble,
  no prose wrapping.
- Prompt caching MUST be enabled on all system prompts containing large
  carrier context blocks. Target ≥ 60% cache hit rate on production traffic.
- The four canonical AI endpoint categories are fixed:
  - `POST /api/v1/ai/load/analyze` — Go/Negotiate/Pass + net profit
  - `POST /api/v1/ai/broker/score` — trust score 0–100 + risk summary
  - `POST /api/v1/ai/invoice/followup` — follow-up draft with tone + channel
  - `POST /api/v1/ai/insurance/playbook` — improvement plan + savings estimate

## Technical Conventions

### API

- All endpoints MUST be prefixed `/api/v1/`.
- Auth MUST use Supabase JWT via `Authorization: Bearer <token>`.
- All responses MUST use the envelope `{ data, error, meta }`.
- On FMCSA 404: return `{ found: false }` — do not throw an error.

### Design System — Dispatcher Command Center

| Token        | Value     |
|--------------|-----------|
| Background   | `#080c10` |
| Surface      | `#0d1318` |
| Border       | `#1e2d3d` |
| Primary      | `#f59e0b` (amber) |
| Success      | `#22c55e` |
| Critical     | `#ef4444` |
| Info         | `#38bdf8` |

Fonts: IBM Plex Mono (data/labels) + IBM Plex Sans (body).
Icons: inline SVG paths only — no emoji, no icon fonts, no emoji anywhere.
Aesthetic: dark industrial "control room".

### Design System — Carrier Portal

Background: `#07090d` (slightly warmer than dispatcher). Same amber/green/red/blue
accent tokens. Fonts: DM Serif Display (headings) + IBM Plex Sans (body).
Aesthetic: warmer, personal, mobile-first.

### Responsive Breakpoints

| Range       | Behaviour                                          |
|-------------|----------------------------------------------------|
| > 1100 px   | Full layout: sidebar + content + detail drawer     |
| 860–1100 px | Detail drawer hidden (overlay on click)            |
| 720–860 px  | Two-col panels stack; KPIs 2-col                   |
| < 720 px    | Sidebar collapses to hamburger overlay; top nav hidden |
| < 480 px    | KPIs single column; forms single column            |

### Notification Rules

| Event                          | Channels                                        |
|--------------------------------|-------------------------------------------------|
| CSA breach or MVR violation    | In-app + email + SMS → dispatcher               |
| Invoice 30+ days overdue       | In-app + email → dispatcher                     |
| Renewal 60 days out            | In-app + email → dispatcher + carrier           |
| Renewal 30 days out            | In-app + email + SMS → dispatcher + carrier     |
| HOS 2 hr remaining             | SMS → dispatcher only                           |
| HOS 30 min remaining           | SMS critical → dispatcher only                  |
| Portal invite                  | SendGrid magic link email → carrier             |

### External Integration Constraints

**FMCSA SAFER**: Rate limit 100 req/min. Cache all responses in `fmcsa_cache`
for 24 h — never skip. On 404 return `{ found: false }`.

**Terminal API (ELD)**: Phase 3 only. OAuth 2.0 per carrier (dispatcher
initiates, carrier authorizes). Webhook required for HOS threshold events.

**Embark Safety / MVR**: Phase 2 only. Driver MUST sign consent form before any
MVR pull (FCRA requirement). Severity: 1=DUI/reckless (−20 IRS pts),
2=major speeding (−10), 3=minor (−5).

**Stripe**: Required webhooks — `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`. No free trials in Phase 1. Carrier upgrade MUST
use Stripe Checkout — not a custom payment form.

## Business Logic & Pricing

### Load Profitability Formulas

```
Load net profit = load_rate − fuel_cost − driver_pay − tolls − other_costs
Load RPM        = load_rate / miles
Load net RPM    = net_profit / miles
```

AI load recommendation thresholds:

| Decision   | Condition                                          |
|------------|----------------------------------------------------|
| GO         | net_rpm ≥ 1.50 AND broker trust_score ≥ 70         |
| NEGOTIATE  | net_rpm ≥ 1.00 OR broker trust_score 50–69         |
| PASS       | net_rpm < 1.00 OR trust_score < 50 OR fraud_flags > 0 |

### Broker Trust Score (0–100)

| Factor                   | Weight |
|--------------------------|--------|
| FMCSA authority status   | 30%    |
| Avg payment days         | 25%    |
| Late payment rate        | 20%    |
| Fraud/complaint flags    | 15%    |
| Operating history years  | 10%    |

### Insurance Readiness Score (IRS, 0–100)

| Sub-score            | Weight | Inputs                              |
|----------------------|--------|-------------------------------------|
| Safety Record        | 25%    | CSA BASICs, crash history           |
| Driver Quality       | 20%    | MVR scores, CDL, PSP                |
| Compliance           | 20%    | ELD, HOS, drug testing              |
| Fleet Risk Profile   | 15%    | Truck age, radius verification      |
| Safety Technology    | 10%    | Dashcams, telematics                |
| Market Readiness     | 10%    | FMCSA rating, no coverage lapse     |

### Invoice Follow-Up Tone

| Days Outstanding | Tone                              |
|------------------|-----------------------------------|
| 7–14 days        | Polite reminder                   |
| 15–21 days       | Firm follow-up                    |
| 22–29 days       | Assertive with deadline           |
| 30+ days         | Final notice with escalation options |

### Pricing Tiers (Stripe Product IDs must match these names exactly)

| Product ID          | Price   | Description                          |
|---------------------|---------|--------------------------------------|
| `dispatcher_pro`    | $99/mo  | Flat, unlimited carriers             |
| `carrier_pro`       | $29/mo  | Per carrier, direct billing          |
| `carrier_fleet`     | $59/mo  | Per carrier, up to 10 trucks         |
| `insurance_addon`   | $49/mo  | Per carrier add-on                   |

Revenue share: 30% of `carrier_pro` MRR to dispatcher partner for first 12 months.
Insurance referral: $200–$500 per bound policy via matched broker.

### User Roles & Access

| Role               | Access                                              |
|--------------------|-----------------------------------------------------|
| `dispatcher_admin` | All carriers in org, full edit, all AI features     |
| `carrier_free`     | Read-only, own data only, no AI features            |
| `carrier_pro`      | Own data, load profitability, broker scores, invoice drafts |
| `carrier_fleet`    | Own fleet, team access, full insurance module       |

### Settled Decisions (Do Not Re-Litigate)

- Carrier portal is mobile web — not a native app — in Phase 1–3.
- Single organization per carrier in Phase 1 (no multi-dispatcher tenancy).
- No free trial — product sells on demonstrated value.
- Dispatcher is the GTM entry point; not direct-to-carrier cold outreach.
- Soft deletes only on all user-facing records.
- All AI calls server-side only — Claude API key never exposed to frontend.
- Prompt caching on all large-context AI calls targeting ≥ 60% cache hit rate.

### Open Questions (Flag — Do Not Assume)

- Which single pain point to build first (confirm after carrier discovery calls).
- Terminal API exact pricing — TODO(TERMINAL_API_PRICING): contact before Phase 3 commit.
- Dispatcher partner agreement structure — TODO(PARTNER_AGREEMENT): equity vs. revenue share only.
- Factoring company integration — TODO(FACTORING_INTEGRATION): Phase 4+ consideration, not decided.

## Governance

- This constitution MUST be loaded and acknowledged at the start of every
  AI-assisted build session before any code or schema is written.
- The constitution supersedes all other practices, preferences, or prior
  session context. If a conflict exists, the constitution wins.
- No phase gate may be bypassed. A gate is passed only when its stated
  criterion is met and explicitly confirmed.
- Open questions listed in this document MUST be flagged if work depends on
  them. Assumptions MUST NOT be made in place of flagged open questions.
- Amendments require: (1) explicit instruction from the product owner,
  (2) a version bump per semantic versioning (MAJOR for principle removal or
  redefinition; MINOR for new principle or section; PATCH for wording
  clarifications), and (3) update of this file before the amended session ends.
- All PRs and implementation sessions MUST verify compliance with Principles
  I–V before merging or delivering.

**Version**: 1.0.0 | **Ratified**: 2026-03-17 | **Last Amended**: 2026-03-17
