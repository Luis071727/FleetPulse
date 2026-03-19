-- Migration: Expand tables to match full data-model.md specification
-- Date: 2026-03-18

-- ============================================================
-- 1. Expand carriers table
-- ============================================================
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS dba_name text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS fmcsa_safety_rating varchar(50);
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS power_units integer;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS drivers integer;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS operating_states text[];
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS cargo_types text[];
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS portal_invite_sent_at timestamptz;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS portal_invite_token_expires_at timestamptz;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS portal_last_accessed_at timestamptz;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS irs_score integer;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS irs_last_calculated_at timestamptz;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS policy_renewal_date date;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_carriers_dot_number ON carriers(dot_number);
CREATE INDEX IF NOT EXISTS idx_carriers_mc_number ON carriers(mc_number);
CREATE INDEX IF NOT EXISTS idx_carriers_status ON carriers(status);
CREATE INDEX IF NOT EXISTS idx_carriers_portal_status ON carriers(portal_status);
CREATE INDEX IF NOT EXISTS idx_carriers_deleted_at ON carriers(deleted_at);

-- ============================================================
-- 2. Expand users table
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_carrier_id ON users(carrier_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- ============================================================
-- 3. Expand loads table
-- ============================================================
ALTER TABLE loads ADD COLUMN IF NOT EXISTS origin_city text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS origin_state varchar(2);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS destination_city text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS destination_state varchar(2);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS route text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_date date;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_date date;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS actual_delivery_at timestamptz;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS ai_recommendation varchar(20);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS ai_reasoning text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS ai_response_id uuid;

CREATE INDEX IF NOT EXISTS idx_loads_carrier_id ON loads(carrier_id);
CREATE INDEX IF NOT EXISTS idx_loads_broker_id ON loads(broker_id);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_created_at ON loads(created_at);
CREATE INDEX IF NOT EXISTS idx_loads_deleted_at ON loads(deleted_at);

-- ============================================================
-- 4. Expand invoices table
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_follow_up_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ai_followup_draft text;

-- ============================================================
-- 5. Expand brokers table
-- ============================================================
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS dot_number text;
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS operating_status varchar(50);
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS authority_status varchar(50);
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS payment_days_avg integer;
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS payment_days_p90 integer;
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS late_payment_rate numeric(5,2);
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fraud_flags integer DEFAULT 0;
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fmcsa_last_pulled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_brokers_trust_score ON brokers(trust_score);

-- ============================================================
-- 6. Create ai_responses table
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type varchar(50) NOT NULL,
  entity_id uuid,
  entity_type varchar(50),
  request_json jsonb NOT NULL,
  response_json jsonb NOT NULL,
  usage_input_tokens integer,
  usage_output_tokens integer,
  cache_hit boolean DEFAULT false,
  ttl_days integer DEFAULT 30,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '30 days'
);

CREATE INDEX IF NOT EXISTS idx_ai_responses_entity_id ON ai_responses(entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_call_type ON ai_responses(call_type);
CREATE INDEX IF NOT EXISTS idx_ai_responses_expires_at ON ai_responses(expires_at);

-- Add FK from loads.ai_response_id -> ai_responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_loads_ai_response_id'
  ) THEN
    ALTER TABLE loads ADD CONSTRAINT fk_loads_ai_response_id
      FOREIGN KEY (ai_response_id) REFERENCES ai_responses(id);
  END IF;
END $$;

-- ============================================================
-- 7. FMCSA cache unique constraint
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_fmcsa_cache_lookup
  ON fmcsa_cache(lookup_type, COALESCE(dot_number, mc_number));

CREATE INDEX IF NOT EXISTS idx_fmcsa_cache_expires_at ON fmcsa_cache(expires_at);

-- ============================================================
-- 8. Soft-delete views
-- ============================================================
CREATE OR REPLACE VIEW active_carriers AS
  SELECT * FROM carriers WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_loads AS
  SELECT * FROM loads WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_invoices AS
  SELECT * FROM invoices WHERE deleted_at IS NULL;

-- ============================================================
-- 9. Enable RLS on new table
-- ============================================================
ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;
