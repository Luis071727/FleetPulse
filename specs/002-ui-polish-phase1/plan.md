# Implementation Plan: Phase 1 UI Polish

**Branch**: `002-ui-polish-phase1` | **Date**: 2026-03-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-ui-polish-phase1/spec.md`

## Summary

Replace all emoji characters with inline SVG icons across the dispatcher Command Center and carrier portal, add top-level "Add Load" and "Add Invoice" entry points on their respective pages, implement a manual carrier entry fallback when FMCSA lookup fails, and scaffold "Coming Soon" placeholders for Phase 2–4 integrations. All changes are frontend-focused with minor backend adjustments (optional `load_id` on invoices, `verification_status` on carriers, DOT uniqueness enforcement).

## Technical Context

**Language/Version**: Python 3.13 (backend) + TypeScript / Next.js 14.2 (frontend)
**Primary Dependencies**: FastAPI 0.116.1, React 18.3, Supabase client 2.16.0
**Storage**: Supabase (PostgreSQL) + in-memory fallback stores (backend)
**Testing**: Manual acceptance testing (no test framework currently configured)
**Target Platform**: Web — Vercel (frontend), Railway (backend)
**Project Type**: Web application (dispatcher SaaS + carrier portal)
**Performance Goals**: All modals open in < 200ms; SVG icons < 2KB each
**Constraints**: Zero external UI dependencies (no icon fonts, no CDN); inline SVGs only; infrastructure < $30/mo
**Scale/Scope**: ~10 pages/modals affected; 2 new modals, 1 new component, 9+ icon replacements

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Dispatcher-Led Architecture | ✅ PASS | All 5 stories serve the dispatcher as primary user. Portal icons are updated but no new carrier features added. |
| II. Immutable Technology Stack | ⚠️ PASS (with pre-existing deviations) | This feature introduces no new dependencies. However, two pre-existing deviations exist: (1) Constitution specifies Python 3.12 but codebase runs **Python 3.13**; (2) Constitution specifies Tailwind CSS but codebase uses **vanilla CSS with inline styles and CSS custom properties**. Neither deviation is introduced or worsened by this feature. A constitution amendment should be filed separately to reflect the actual stack. |
| III. Data Security & Access Control | ✅ PASS | No new tables/RLS changes needed. `verification_status` added to existing carrier store. All AI calls remain server-side. DOT uniqueness enforced. |
| IV. Phase-Gated Build | ✅ PASS | All work is Phase 1 scope. ComingSoon placeholder cards are purely presentational — they contain **no logic, API calls, data model elements, or functional stubs** from future phases. They display static text and an icon only, which does not violate the "MUST NOT be implemented, stubbed, or wired up" rule. |
| V. AI Integrity | ✅ PASS | No AI changes. Existing load analysis flow is reused as-is from the new Add Load modal. |
| Icons: inline SVG only | ✅ PASS | Constitution explicitly states "inline SVG paths only — no emoji, no icon fonts." This feature enforces that rule. |
| Design tokens | ✅ PASS | All icons use `currentColor` to inherit from existing CSS design tokens. |

**Gate result: PASS — no violations. Proceeding to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/002-ui-polish-phase1/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-contracts.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
fleetpulse-dispatcher/
├── backend/
│   └── app/
│       ├── carriers/
│       │   ├── routes.py        # MODIFY: manual carrier creation endpoint, DOT uniqueness
│       │   └── service.py       # MODIFY: verification_status field, uniqueness check
│       └── invoices/
│           ├── routes.py        # MODIFY: make load_id optional for manual invoices
│           └── service.py       # MODIFY: standalone invoice creation
└── frontend/
    ├── components/
    │   ├── icons/               # NEW: SVG icon components directory
    │   │   └── index.tsx        # NEW: all inline SVG icon exports
    │   ├── LogLoadModal.tsx     # MODIFY: extract form logic, add carrier selector
    │   ├── AddCarrierModal.tsx  # MODIFY: manual entry fallback form
    │   ├── AddInvoiceModal.tsx  # NEW: manual invoice creation modal
    │   └── ComingSoon.tsx       # NEW: reusable placeholder component
    ├── app/
    │   ├── (dispatcher)/
    │   │   ├── layout.tsx       # MODIFY: replace emoji nav icons with SVG
    │   │   ├── loads/page.tsx   # MODIFY: add "Add Load" button + modal
    │   │   ├── invoices/page.tsx# MODIFY: add "Add Invoice" button + modal
    │   │   ├── carriers/page.tsx# MODIFY: unverified badge, SVG icons
    │   │   └── insurance/page.tsx # MODIFY: Coming Soon placeholders
    │   └── (portal)/
    │       └── layout.tsx       # MODIFY: replace emoji icons with SVG
    └── services/
        └── api.ts              # MODIFY: add createInvoice(), createCarrierManual()
```

**Structure Decision**: Web application with separate `backend/` and `frontend/` directories. All new frontend components go under `frontend/components/`. A new `icons/` subdirectory centralizes all SVG icon definitions. No new top-level directories needed.

## Post-Design Constitution Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Dispatcher-Led Architecture | ✅ PASS | No carrier-facing features added. Portal icon updates are cosmetic only. |
| II. Immutable Technology Stack | ⚠️ PASS (with pre-existing deviations) | No packages added. Pre-existing deviations (Python 3.13 vs 3.12, vanilla CSS vs Tailwind) noted in pre-design check — unchanged by this feature. |
| III. Data Security & Access Control | ✅ PASS | `verification_status` + `address`/`phone` are simple fields on existing carrier store. DOT uniqueness enforced server-side. `load_id` made nullable — no new tables, no RLS changes. |
| IV. Phase-Gated Build | ✅ PASS | ComingSoon cards contain zero functional code from future phases — no API calls, no data models, no service integrations. Static text and icons only. |
| V. AI Integrity | ✅ PASS | No AI endpoint changes. Load analysis reused as-is. |
| Design system tokens | ✅ PASS | Icons use `currentColor`. New modals use `var(--surface)`, `var(--border)`, `var(--amber)`. |
| Soft deletes only | ✅ PASS | No delete operations introduced. |
| snake_case columns | ✅ PASS | New fields: `verification_status`, `load_id`, `dot_number` — all snake_case. |

**Post-design gate: PASS — no violations.**

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
