# Research: Phase 1 UI Polish

**Feature**: 002-ui-polish-phase1
**Date**: 2026-03-18

---

## Research Task 1: Inline SVG Icon Approach

**Context**: Constitution mandates "inline SVG paths only — no emoji, no icon fonts, no emoji anywhere." Need to determine the best approach for creating/sourcing SVG icons and organizing them in the codebase.

**Decision**: Create a single `frontend/components/icons/index.tsx` file exporting named React functional components, each rendering an inline `<svg>` element. Icons sourced from Lucide (MIT-licensed open-source icon set) and hand-adapted to match the design system.

**Rationale**:
- Single file keeps icon definitions co-located and easy to audit.
- Each icon is a React component accepting `size` and `className` props, defaulting to `width: 1em, height: 1em`.
- All icons use `currentColor` for `stroke`/`fill` — inheriting the parent's CSS `color` property. This ensures they respect the existing design token system without hardcoded colors.
- No external package dependency — icons are copied as raw SVG paths, not imported from a library.

**Alternatives considered**:
- **Heroicons package** (`@heroicons/react`): Rejected — adds npm dependency, violates zero-external-UI-dependency constraint.
- **Icon font (Font Awesome)**: Rejected — constitution explicitly prohibits icon fonts.
- **Separate `.svg` files with Next.js `Image`**: Rejected — requires file-based imports, doesn't support `currentColor`, adds bundler complexity.

### Icon Inventory

| Current Emoji | Replacement SVG | Usage Locations |
|---------------|----------------|-----------------|
| 📊 (chart) | `BarChart3` — 3-bar chart icon | Sidebar nav: Dashboard |
| 🚛 (truck) | `Truck` — truck silhouette | Sidebar nav: Carriers |
| 📦 (package) | `Package` — box icon | Sidebar nav: Loads |
| 💰 (money bag) | `DollarSign` — circle with $ | Sidebar nav: Invoices |
| 🛡️ (shield) | `Shield` — shield outline | Sidebar nav: Insurance IQ |
| ⚡ (bolt) | `Zap` — lightning bolt | FleetPulse logo/header |
| ☰ (hamburger) | `Menu` — 3 horizontal lines | Mobile hamburger button |
| ✕ (close) | `X` — diagonal cross | Modal/drawer close buttons |
| ⚠ (warning) | `AlertTriangle` — triangle with ! | Overdue invoice warnings |
| 🔒 (lock) | `Lock` — padlock icon | Portal free-tier banner |

---

## Research Task 2: Carrier Selector Pattern for Add Load Modal

**Context**: The existing `LogLoadModal.tsx` is opened from the carrier detail drawer and implicitly knows the carrier. The new "Add Load" button on the Loads page needs to let the dispatcher pick a carrier first.

**Decision**: Add a searchable `<select>` dropdown at the top of the modal form. The dropdown loads the carrier list from `listCarriers()` on modal open and filters client-side by legal name or DOT number as the user types.

**Rationale**:
- The carrier list is already fetched on the Carriers page and available via `listCarriers()` API.
- Client-side filtering is sufficient — carrier rosters are typically < 200 entries at this stage.
- A native `<select>` with a text filter input above it keeps the UI lightweight and consistent with the existing form style (inline style objects, no component library).
- When opened from the carrier detail drawer, the carrier is pre-selected and the selector is disabled (preserving existing behavior).

**Alternatives considered**:
- **Combobox component library (react-select, headless-ui)**: Rejected — adds external dependency.
- **Server-side search endpoint**: Premature — carrier rosters are small in Phase 1.

---

## Research Task 3: Manual Carrier Entry Backend Requirements

**Context**: Currently `POST /carriers` requires a DOT number and performs an FMCSA lookup. If lookup fails, the request errors. Need to support manual entry when FMCSA is unavailable.

**Decision**: Add a new `POST /carriers/manual` endpoint that accepts `legal_name` (required), `dot_number`, `mc_number`, `address`, `phone`, `power_units` and creates the carrier with `verification_status: "unverified"`. DOT uniqueness is enforced at the endpoint level — if a carrier with the same DOT already exists (in `_CARRIERS` list or Supabase), return 409 Conflict with the existing carrier's ID.

**Rationale**:
- Separate endpoint keeps the FMCSA-lookup flow clean and avoids conditional logic in the existing `POST /carriers`.
- `verification_status` is added as a string field: `"verified"` (default for FMCSA-confirmed) or `"unverified"` (manual entry).
- DOT uniqueness check runs against both in-memory store and Supabase to prevent duplicates.
- The existing `POST /carriers` endpoint also gets a DOT uniqueness check (returns 409 if DOT already exists) to satisfy FR-013a.

**Alternatives considered**:
- **Single endpoint with `manual: boolean` flag**: Rejected — muddies the API contract and validation logic.
- **Frontend-only validation of DOT uniqueness**: Rejected — must be enforced server-side for data integrity.

---

## Research Task 4: Manual Invoice Creation Backend Requirements

**Context**: Currently invoices are auto-created when a load is logged. `load_id` is a required field. Need to support standalone invoices without an associated load.

**Decision**: Make `load_id` optional on the invoice creation flow. Add a `POST /invoices` endpoint (or modify existing) that accepts `carrier_id` (required), `broker_id` (optional), `amount` (required), `issued_date`, `due_date`, and `load_id` (optional). When `load_id` is null, the invoice is standalone.

**Rationale**:
- The existing `CreateLoadIn` auto-creates invoices with `load_id` set. Manual invoices just have `load_id = None`.
- No schema changes needed — `load_id` in the in-memory store can already be nullable (Python `str | None`).
- The frontend needs a new `createInvoice()` function in `api.ts` calling this endpoint.

**Alternatives considered**:
- **Require a "dummy" load for manual invoices**: Rejected — pollutes load data.
- **Separate invoice entity type**: Rejected — overcomplicates the data model for a simple nullable FK.

---

## Research Task 5: Coming Soon Component Design

**Context**: Need a reusable placeholder component for Phase 2–4 features that communicates roadmap intent.

**Decision**: Create `frontend/components/ComingSoon.tsx` — a presentational component accepting `title: string`, `description: string`, `phase: string`, and `icon: React.ReactNode`. Renders a centered card with the icon, title, phase badge, and description text, styled with existing design tokens.

**Rationale**:
- Reusable across Insurance IQ (Phase 2), ELD sections (Phase 3), and billing areas (Phase 4).
- Uses existing CSS custom properties (`--surface`, `--border`, `--amber`, `--mist`) for consistent styling.
- The `icon` prop accepts any React node (including our new SVG components), keeping it flexible.
- No interactivity needed — purely informational.

**Alternatives considered**:
- **Page-level placeholders (no shared component)**: Rejected — duplicates markup across pages.
- **JSON config-driven placeholders**: Rejected — overengineered for 5–6 instances.

---

## Research Task 6: Existing Form Patterns & Style Conventions

**Context**: Need to understand existing form/modal patterns to ensure new modals (AddInvoiceModal, manual carrier form) are visually consistent.

**Decision**: Follow the established patterns from `LogLoadModal.tsx` and `AddCarrierModal.tsx`:

**Modal pattern**:
- `position: fixed; inset: 0` with semi-transparent backdrop (`rgba(0,0,0,0.6)`)
- Centered card with `background: var(--surface)`, `border: 1px solid var(--border)`, `borderRadius: 14px`
- Header with title + close button (will be SVG `X` icon)
- Body with form fields in a 2-column grid (`display: grid; gridTemplateColumns: 1fr 1fr; gap: 12px`)
- Footer with primary action button (`background: var(--amber)`, `color: #000`, `borderRadius: 8px`)

**Input pattern**:
- `background: var(--bg)`, `border: 1px solid var(--border)`, `color: var(--white)`
- `borderRadius: 8px`, `padding: 10px 14px`
- `fontFamily: 'IBM Plex Mono'` for data inputs

**Error pattern**:
- Error text: `color: #ef4444`, displayed below form or inline below field

**Loading pattern**:
- Button text changes to "Saving..." / "Loading..." with `opacity: 0.7`, `pointerEvents: 'none'`

**Rationale**: Consistency with existing modals. No new CSS classes or style objects needed beyond what's already established.

---

## Summary of Resolved Unknowns

| Unknown | Resolution |
|---------|-----------|
| Icon approach | Inline SVG components in `icons/index.tsx`, sourced from Lucide (MIT), using `currentColor` |
| Carrier selector | Searchable dropdown loading from `listCarriers()`, client-side filter |
| Manual carrier backend | New `POST /carriers/manual` endpoint with `verification_status` field |
| DOT uniqueness | Server-side enforcement returning 409 Conflict with existing carrier ID |
| Manual invoice backend | Make `load_id` optional, new `POST /invoices` endpoint |
| Coming Soon component | Reusable `ComingSoon.tsx` with title/description/phase/icon props |
| Form/modal styling | Follow existing `LogLoadModal` patterns (fixed overlay, grid forms, amber buttons) |

All NEEDS CLARIFICATION items resolved. Proceeding to Phase 1 design.
