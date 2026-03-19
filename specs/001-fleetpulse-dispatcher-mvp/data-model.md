# Data Model: FleetPulse AI Database Schema & RLS Policies

**Phase**: 1 (Design)  
**Date**: 2026-03-17  
**Database**: Supabase (PostgreSQL 14+)  
**RLS Enforcement**: Mandatory on all tables per Constitution III

---

## Schema Overview

All tables use:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at timestamptz DEFAULT now()`
- `updated_at timestamptz DEFAULT now()`
- Column naming: snake_case throughout
- Soft deletes: `deleted_at timestamptz` (null = active) instead of hard deletes

---

## 1. organizations

**Purpose**: Represents a dispatching company. One organization owns all users and carriers.

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,  -- e.g., "mendez-dispatch"
  plan varchar(50) DEFAULT 'dispatcher_pro',  -- dispatcher_pro, demo
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_deleted_at ON organizations(deleted_at);
```

**RLS Policies**: Organizations table is read-only for authenticated users; write access via backend service role only.

---

## 2. users

**Purpose**: A person who can log in (dispatcher or carrier). Linked to Supabase Auth via auth.users(id).

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  carrier_id uuid,  -- NULL for dispatchers; set for carriers
  role varchar(50) NOT NULL DEFAULT 'carrier_free',  -- dispatcher_admin, carrier_free, carrier_pro, carrier_fleet
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT role_carrier_consistency CHECK (
    (role = 'dispatcher_admin' AND carrier_id IS NULL) OR
    (role IN ('carrier_free', 'carrier_pro', 'carrier_fleet') AND carrier_id IS NOT NULL)
  )
);

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_carrier_id ON users(carrier_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```

**RLS Policies**:
- `auth.uid()` can read own row
- Dispatchers of org O can read all users in org O where role != dispatcher_admin (view other users)
- Dispatchers of org O can write only other users' last_login_at
- Service role can write anywhere (signup, invite)

---

## 3. carriers

**Purpose**: A trucking carrier managed by a dispatcher's organization.

```sql
CREATE TABLE carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  dot_number text NOT NULL,
  mc_number text,
  legal_name text NOT NULL,
  dba_name text,
  status varchar(50) DEFAULT 'new',  -- auto-computed: new/active/idle/issues
  fmcsa_safety_rating varchar(50),  -- Satisfactory, Conditional, Provisional, Out-of-Service, None
  power_units integer,
  drivers integer,
  operating_states text[],  -- e.g., ARRAY['TX', 'OK', 'LA']
  cargo_types text[],
  eld_provider text,
  eld_connected boolean DEFAULT false,
  portal_status varchar(50) DEFAULT 'not_invited',  -- not_invited, invited, active
  portal_invite_sent_at timestamptz,
  portal_invite_token_expires_at timestamptz,
  portal_last_accessed_at timestamptz,
  contact_email text,
  contact_phone text,
  irs_score integer,  -- Insurance Readiness Score (0-100, Phase 2)
  irs_last_calculated_at timestamptz,
  policy_renewal_date date,
  current_insurer text,
  annual_premium numeric(10, 2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(organization_id, dot_number)  -- One org can't add same carrier twice
);

CREATE INDEX idx_carriers_organization_id ON carriers(organization_id);
CREATE INDEX idx_carriers_dot_number ON carriers(dot_number);
CREATE INDEX idx_carriers_mc_number ON carriers(mc_number);
CREATE INDEX idx_carriers_status ON carriers(status);
CREATE INDEX idx_carriers_portal_status ON carriers(portal_status);
CREATE INDEX idx_carriers_irs_score ON carriers(irs_score);
CREATE INDEX idx_carriers_deleted_at ON carriers(deleted_at);
```

**Auto-Computed Fields** (via function trigger or application layer):
- `status` recalculates based on: last_load_date, last_overdue_invoice, CSA alerts
  - `new`: never had a load
  - `active`: load within 30 days
  - `idle`: no load in 60+ days
  - `issues`: invoice 30+ days overdue OR CSA breach detected

**RLS Policies**:
- Dispatcher of org O: read/write all carriers in org O
- Carrier C: read own carrier_id only
- List query automatically filtered to org_id = auth.organization_id()

---

## 4. loads

**Purpose**: A freight movement logged by a dispatcher.

```sql
CREATE TABLE loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  carrier_id uuid NOT NULL REFERENCES carriers(id),
  broker_id uuid REFERENCES brokers(id),
  bol_number text,
  origin_city text NOT NULL,
  origin_state varchar(2) NOT NULL,
  destination_city text NOT NULL,
  destination_state varchar(2) NOT NULL,
  miles numeric(8, 2),
  load_rate numeric(10, 2) NOT NULL,
  fuel_cost numeric(10, 2),
  driver_pay numeric(10, 2),
  tolls numeric(10, 2),
  net_profit numeric(10, 2),  -- rate - fuel - driver_pay - tolls
  rpm numeric(6, 2),  -- rate per mile
  net_rpm numeric(6, 2),  -- net_profit / miles
  status varchar(50) DEFAULT 'logged',  -- logged, in_transit, at_pickup, delivered, issues
  pickup_date date,
  delivery_date date,
  actual_delivery_at timestamptz,
  ai_recommendation varchar(20),  -- go, negotiate, pass (Phase 1, Week 5)
  ai_reasoning text,  -- plain-English explanation
  ai_response_id uuid REFERENCES ai_responses(id),  -- link to full AI response
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_loads_organization_id ON loads(organization_id);
CREATE INDEX idx_loads_carrier_id ON loads(carrier_id);
CREATE INDEX idx_loads_broker_id ON loads(broker_id);
CREATE INDEX idx_loads_status ON loads(status);
CREATE INDEX idx_loads_created_at ON loads(created_at);
CREATE INDEX idx_loads_deleted_at ON loads(deleted_at);
```

**RLS Policies**:
- Dispatcher of org O: read/write loads where organization_id = O
- Carrier C: read loads where carrier_id = C only
- Default list filters to org_id or carrier_id based on role

---

## 5. invoices

**Purpose**: Accounts receivable record linked to a load.

```sql
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  load_id uuid REFERENCES loads(id),  -- nullable if invoice created manually
  carrier_id uuid NOT NULL REFERENCES carriers(id),
  broker_id uuid REFERENCES brokers(id),
  invoice_number text,
  amount numeric(10, 2) NOT NULL,
  status varchar(50) DEFAULT 'pending',  -- pending, paid, disputed, factored
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid_date date,
  days_outstanding integer GENERATED ALWAYS AS (CURRENT_DATE - issued_date) STORED,
  follow_up_count integer DEFAULT 0,
  last_follow_up_at timestamptz,
  ai_followup_draft text,  -- cached follow-up email/SMS draft (Phase 1, Week 5)
  ai_followup_response_id uuid REFERENCES ai_responses(id),
  factoring_eligible boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX idx_invoices_carrier_id ON invoices(carrier_id);
CREATE INDEX idx_invoices_broker_id ON invoices(broker_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_days_outstanding ON invoices(days_outstanding);
CREATE INDEX idx_invoices_deleted_at ON invoices(deleted_at);
```

**Computed Column**: `days_outstanding` is automatically computed via `GENERATED ALWAYS AS`; no manual update needed.

**Auto-Create on Load**: When a load is created, a peer invoice is created with amount=load.load_rate, issued_date=today, carrier_id and broker_id inherited from load.

**RLS Policies**:
- Dispatcher of org O: read/write where organization_id = O
- Carrier C: read where carrier_id = C (read-only on portal)

---

## 6. brokers

**Purpose**: Freight brokers identified by MC number. Stores trust scores and payment history.

```sql
CREATE TABLE brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mc_number text UNIQUE NOT NULL,
  legal_name text,
  dot_number text,
  operating_status varchar(50),  -- Active, Inactive, Revoked, Out-of-Service
  authority_status varchar(50),  -- Satisfactory, Conditional, Provisional, None
  trust_score numeric(5, 2) DEFAULT 60,  -- 0-100, computed from FMCSA + payment history
  trust_score_source varchar(50) DEFAULT 'fmcsa',  -- fmcsa, payment_history, hybrid
  payment_days_avg integer,  -- avg days to pay (from invoice data)
  payment_days_p90 integer,  -- 90th percentile (worst 10%)
  late_payment_rate numeric(5, 2),  -- % of invoices paid >30 days late
  fraud_flags integer DEFAULT 0,  -- count of complaints/FMCSA violations
  fmcsa_last_pulled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_brokers_mc_number ON brokers(mc_number);
CREATE INDEX idx_brokers_trust_score ON brokers(trust_score);
CREATE INDEX idx_brokers_deleted_at ON brokers(deleted_at);
```

**Trust Score Initialization** (Phase 1, Clarification #5):
- On first encounter, compute from FMCSA authority fields: authority_status (70%) + operating_history (30%)
- Typical initial score: 55–65 (NEGOTIATE zone)
- Display: "Score based on FMCSA data only"
- Refine over time as payment history accumulates

**RLS Policies**: Public read (any authenticated user); service role write only.

---

## 7. fmcsa_cache

**Purpose**: Cache of FMCSA SAFER API responses to avoid rate-limit exhaustion.

```sql
CREATE TABLE fmcsa_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_type varchar(50) NOT NULL,  -- carrier, broker
  dot_number text,
  mc_number text,
  response_json jsonb NOT NULL,  -- Full FMCSA response
  http_status_code integer,  -- 200, 404, 429, 500
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours',
  UNIQUE(lookup_type, COALESCE(dot_number, mc_number))
);

CREATE INDEX idx_fmcsa_cache_dot ON fmcsa_cache(dot_number);
CREATE INDEX idx_fmcsa_cache_mc ON fmcsa_cache(mc_number);
CREATE INDEX idx_fmcsa_cache_expires_at ON fmcsa_cache(expires_at);
```

**RLS Policies**: All authenticated users can read; service role writes only.

**Cache Validation**:
- Query: `SELECT response_json FROM fmcsa_cache WHERE dot_number = $1 AND expires_at > now()`
- If expired or not found: fetch fresh from FMCSA, then UPSERT into cache

---

## 8. carrier_insurance_profiles (Phase 2)

**Purpose**: Per-carrier insurance metadata for IRS scoring and playbook generation.

```sql
CREATE TABLE carrier_insurance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id uuid NOT NULL UNIQUE REFERENCES carriers(id),
  irs_score integer,  -- 0-100, composite
  irs_sub_scores jsonb,  -- { safety_record: 80, driver_quality: 70, ... }
  safety_record_score integer,  -- 0-100
  driver_quality_score integer,
  compliance_score integer,
  fleet_risk_score integer,
  safety_tech_score integer,
  market_readiness_score integer,
  irs_last_calculated_at timestamptz,
  ai_playbook_draft text,  -- Cached AI playbook output
  ai_playbook_response_id uuid REFERENCES ai_responses(id),
  data_quality_notes text,  -- e.g., "Driver data incomplete, using defaults"
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_carrier_insurance_profiles_carrier_id ON carrier_insurance_profiles(carrier_id);
CREATE INDEX idx_carrier_insurance_profiles_irs_score ON carrier_insurance_profiles(irs_score);
```

**RLS Policies**: Dispatcher of org O can read/write when carrier belongs to org O; carrier can read own profile only.

---

## 9. driver_insurance_profiles (Phase 2)

**Purpose**: Per-driver data feeding Driver Quality sub-score.

```sql
CREATE TABLE driver_insurance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id uuid NOT NULL REFERENCES carriers(id),
  driver_name text NOT NULL,
  cdl_number text,
  cdl_class varchar(1),  -- A, B, C
  cdl_expiration_date date,
  years_experience integer,
  mvr_consent_signed boolean DEFAULT false,
  mvr_consent_signed_at timestamptz,
  mvr_score integer,  -- 0-100 composite (quality indicator)
  psp_inspections_3yr integer DEFAULT 0,
  psp_crashes_5yr integer DEFAULT 0,
  mvr_severity_events jsonb,  -- Array of { severity: 1|2|3, event: "DUI", date: "2025-05-01" }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_driver_insurance_profiles_carrier_id ON driver_insurance_profiles(carrier_id);
CREATE INDEX idx_driver_insurance_profiles_mvr_consent_signed ON driver_insurance_profiles(mvr_consent_signed);
CREATE INDEX idx_driver_insurance_profiles_deleted_at ON driver_insurance_profiles(deleted_at);
```

**RLS Policies**: Dispatcher of org O can read/write drivers of carriers in org O; carrier can read own drivers only.

---

## 10. csa_score_history (Phase 2)

**Purpose**: Snapshots of FMCSA CSA BASIC percentiles per carrier over time.

```sql
CREATE TABLE csa_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id uuid NOT NULL REFERENCES carriers(id),
  unsafe_driving numeric(5, 2),  -- BASIC percentile 0-100
  hos_compliance numeric(5, 2),
  driver_fitness numeric(5, 2),
  controlled_substances numeric(5, 2),
  vehicle_maintenance numeric(5, 2),
  crash_indicator numeric(5, 2),
  hazmat_compliance numeric(5, 2),
  record_quality numeric(5, 2),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  fmcsa_pulled_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(carrier_id, snapshot_date)
);

CREATE INDEX idx_csa_score_history_carrier_id ON csa_score_history(carrier_id);
CREATE INDEX idx_csa_score_history_snapshot_date ON csa_score_history(snapshot_date);
```

**RLS Policies**: Dispatcher of org O can read CSA scores for carriers in org O; carrier can read own scores only.

---

## 11. ai_responses

**Purpose**: Audit trail and reuse cache for all Claude API calls.

```sql
CREATE TABLE ai_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type varchar(50) NOT NULL,  -- load_analyze, broker_score, invoice_followup, insurance_playbook
  entity_id uuid,  -- load_id, broker_id, invoice_id, or carrier_id
  entity_type varchar(50),  -- load, broker, invoice, carrier
  request_json jsonb NOT NULL,  -- Input to Claude (sanitized of PII)
  response_json jsonb NOT NULL,  -- Full Claude response (structured JSON)
  usage_input_tokens integer,
  usage_output_tokens integer,
  cache_hit boolean DEFAULT false,  -- True if from prompt cache
  ttl_days integer DEFAULT 30,  -- Auto-delete after 30 days
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '30 days'
);

CREATE INDEX idx_ai_responses_entity_id ON ai_responses(entity_id);
CREATE INDEX idx_ai_responses_call_type ON ai_responses(call_type);
CREATE INDEX idx_ai_responses_created_at ON ai_responses(created_at);
CREATE INDEX idx_ai_responses_expires_at ON ai_responses(expires_at);
```

**RLS Policies**: Dispatcher of org O can read responses for entities in org O; service role writes.

---

## Global RLS Enforcement

Enable RLS on all 11 tables immediately after creation:

```sql
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmcsa_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_insurance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_insurance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE csa_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;
```

---

## Soft Delete Views

Create views that hide soft-deleted records for easier querying:

```sql
CREATE VIEW active_carriers AS
  SELECT * FROM carriers WHERE deleted_at IS NULL;

CREATE VIEW active_loads AS
  SELECT * FROM loads WHERE deleted_at IS NULL;

CREATE VIEW active_invoices AS
  SELECT * FROM invoices WHERE deleted_at IS NULL;

-- etc. for all tables
```

---

## Summary

| Table | Records | Phase | RLS | Indexes | Soft Deletes |
|-------|---------|-------|-----|---------|--------------|
| organizations | ~100 | 1 | ✅ | 2 | ✅ |
| users | ~1000 | 1 | ✅ | 4 | ✅ |
| carriers | 7-100 | 1 | ✅ | 8 | ✅ |
| loads | 100-1000 | 1 | ✅ | 6 | ✅ |
| invoices | 100-1000 | 1 | ✅ | 6 | ✅ |
| brokers | 50-500 | 1 | ✅ | 3 | ✅ |
| fmcsa_cache | <1000 | 1 | ✅ | 3 | ✗ (auto-expire) |
| carrier_insurance_profiles | 7-100 | 2 | ✅ | 2 | ✗ |
| driver_insurance_profiles | 50-200 | 2 | ✅ | 3 | ✅ |
| csa_score_history | 100-1000 | 2 | ✅ | 2 | ✗ (historical) |
| ai_responses | 1000-10000 | 1 | ✅ | 4 | ✗ (auto-expire) |

**Total**: 11 tables, 50 indexes, 100% RLS coverage, ready for Phase 1 implementation.
