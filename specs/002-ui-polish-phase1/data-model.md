# Data Model: Phase 1 UI Polish

**Feature**: 002-ui-polish-phase1
**Date**: 2026-03-18

---

## Entity Changes

### Carrier (MODIFIED)

**New field**: `verification_status`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `verification_status` | `str` | `"verified"` | `"verified"` for FMCSA-confirmed carriers, `"unverified"` for manually entered carriers |

**All existing fields unchanged**:
- `id` (uuid), `organization_id` (uuid), `dot_number` (str), `mc_number` (str | None)
- `legal_name` (str), `dba_name` (str | None)
- `fmcsa_safety_rating` (str | None), `power_units` (int | None), `drivers` (int | None)
- `status` (str: new/active/idle/issues — computed)
- `portal_status` (str: not_invited/invited/active)
- `contact_name` (str | None), `contact_email` (str | None), `contact_phone` (str | None)
- `notes` (str | None)
- `created_at` (str), `updated_at` (str), `deleted_at` (str | None)

**New fields for manual entry**:
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `address` | `str \| None` | `None` | Physical address (manual entry only) |
| `phone` | `str \| None` | `None` | Phone number (manual entry only) |

**Uniqueness constraint**: `dot_number` must be unique within an organization. Enforced at the API layer (in-memory check + Supabase query).

**State transitions for verification_status**:
```
unverified ──(FMCSA re-verification succeeds)──► verified
verified (no reverse transition)
```

### Invoice (MODIFIED)

**Changed field**: `load_id`

| Field | Type (before) | Type (after) | Notes |
|-------|--------------|-------------|-------|
| `load_id` | `str` (required) | `str \| None` (optional) | `None` for manually created standalone invoices |

**All other invoice fields unchanged**.

### Load (NO CHANGES)

No structural changes. The Add Load modal reuses the existing `CreateLoadIn` schema. The carrier selector is a frontend-only concern.

### Coming Soon Card (NEW — presentational only)

Not a data entity. A React component with the following props interface:

```typescript
interface ComingSoonProps {
  title: string;        // e.g., "IRS Scoring"
  description: string;  // e.g., "Insurance Readiness Score with CSA integration"
  phase: string;        // e.g., "Phase 2"
  icon: React.ReactNode; // SVG icon component
}
```

---

## New API Schemas

### CreateCarrierManualIn

```python
class CreateCarrierManualIn(BaseModel):
    dot_number: str                # Pre-filled from failed lookup
    legal_name: str                # Required — user must type this
    mc_number: str | None = None
    address: str | None = None
    phone: str | None = None
    power_units: int | None = None
    notes: str | None = None
```

### CreateInvoiceIn

```python
class CreateInvoiceIn(BaseModel):
    carrier_id: str                # Required — select from roster
    broker_id: str | None = None   # Optional
    amount: float                  # Required
    issued_date: str | None = None # Defaults to today
    due_date: str | None = None    # Defaults to issued_date + 30 days
    load_id: str | None = None     # Optional — null for standalone invoices
```

---

## Relationship Diagram

```
Organization (1) ──► (*) Carrier
    │                    │
    │                    ├── verification_status: verified | unverified
    │                    ├── dot_number (UNIQUE per org)
    │                    │
    │                    ├──► (*) Load
    │                    │       │
    │                    │       └──► (0..1) Invoice  [auto-created]
    │                    │
    │                    └──► (*) Invoice  [manual, load_id = null]
    │
    └──► (*) Broker
```

---

## Validation Rules

| Entity | Field | Rule |
|--------|-------|------|
| Carrier (manual) | `legal_name` | Required, non-empty, max 200 chars |
| Carrier (manual) | `dot_number` | Required, numeric string, unique per org |
| Carrier (manual) | `power_units` | If provided, must be positive integer |
| Invoice (manual) | `carrier_id` | Required, must reference existing carrier |
| Invoice (manual) | `amount` | Required, positive number |
| Invoice (manual) | `due_date` | If provided, must be ≥ `issued_date` |
