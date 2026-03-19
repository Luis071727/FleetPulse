# API Contracts: Phase 1 UI Polish

**Feature**: 002-ui-polish-phase1
**Date**: 2026-03-18

---

All endpoints follow the constitution's API conventions:
- Prefix: `/api/v1/`
- Auth: `Authorization: Bearer <token>` (Supabase JWT)
- Response envelope: `{ data, error, meta }`

---

## New Endpoints

### POST /api/v1/carriers/manual

Create a carrier via manual entry (when FMCSA lookup fails).

**Request**:
```json
{
  "dot_number": "1234567",
  "legal_name": "ABC Trucking LLC",
  "mc_number": "MC-987654",
  "address": "123 Main St, Dallas TX 75201",
  "phone": "214-555-0100",
  "power_units": 12,
  "notes": "New carrier, FMCSA pending"
}
```

**Response (201)**:
```json
{
  "data": {
    "id": "uuid",
    "organization_id": "uuid",
    "dot_number": "1234567",
    "legal_name": "ABC Trucking LLC",
    "mc_number": "MC-987654",
    "dba_name": null,
    "fmcsa_safety_rating": null,
    "power_units": 12,
    "drivers": null,
    "status": "new",
    "portal_status": "not_invited",
    "verification_status": "unverified",
    "address": "123 Main St, Dallas TX 75201",
    "phone": "214-555-0100",
    "contact_name": null,
    "contact_email": null,
    "contact_phone": null,
    "notes": "New carrier, FMCSA pending",
    "created_at": "2026-03-18T00:00:00Z",
    "updated_at": "2026-03-18T00:00:00Z",
    "deleted_at": null
  },
  "error": null,
  "meta": {}
}
```

**Error — DOT already exists (409)**:
```json
{
  "data": null,
  "error": "A carrier with DOT 1234567 already exists",
  "meta": {
    "existing_carrier_id": "uuid-of-existing-carrier"
  }
}
```

**Error — Missing required field (422)**:
```json
{
  "data": null,
  "error": "legal_name is required",
  "meta": {}
}
```

---

### POST /api/v1/invoices

Create a standalone invoice (manual entry).

**Request**:
```json
{
  "carrier_id": "uuid",
  "broker_id": "uuid-or-null",
  "amount": 3500.00,
  "issued_date": "2026-03-18",
  "due_date": "2026-04-17",
  "load_id": null
}
```

**Response (201)**:
```json
{
  "data": {
    "id": "uuid",
    "organization_id": "uuid",
    "load_id": null,
    "carrier_id": "uuid",
    "broker_id": null,
    "amount": 3500.00,
    "status": "pending",
    "days_outstanding": 0,
    "followups_sent": 0,
    "issued_date": "2026-03-18",
    "due_date": "2026-04-17",
    "paid_date": null,
    "last_followup_tone": null,
    "last_follow_up_at": null,
    "created_at": "2026-03-18T00:00:00Z",
    "updated_at": "2026-03-18T00:00:00Z"
  },
  "error": null,
  "meta": {}
}
```

---

## Modified Endpoints

### POST /api/v1/carriers (existing — add DOT uniqueness check)

**New behavior**: Before performing FMCSA lookup, check if a carrier with the same `dot_number` already exists for this organization. If yes, return 409 Conflict.

**Error — DOT already exists (409)**:
```json
{
  "data": null,
  "error": "A carrier with DOT 1234567 already exists",
  "meta": {
    "existing_carrier_id": "uuid-of-existing-carrier"
  }
}
```

### GET /api/v1/carriers (existing — add verification_status to response)

**New field in each carrier object**: `"verification_status": "verified" | "unverified"`

No changes to query parameters.

---

## Frontend API Client Additions (`services/api.ts`)

### createCarrierManual(data)

```typescript
export async function createCarrierManual(data: {
  dot_number: string;
  legal_name: string;
  mc_number?: string;
  address?: string;
  phone?: string;
  power_units?: number;
  notes?: string;
}): Promise<ApiResponse<Carrier>> {
  // POST /api/v1/carriers/manual
}
```

### createInvoice(data)

```typescript
export async function createInvoice(data: {
  carrier_id: string;
  broker_id?: string;
  amount: number;
  issued_date?: string;
  due_date?: string;
  load_id?: string;
}): Promise<ApiResponse<Invoice>> {
  // POST /api/v1/invoices
}
```
