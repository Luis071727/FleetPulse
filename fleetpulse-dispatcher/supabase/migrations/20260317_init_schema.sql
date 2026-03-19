CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan text NOT NULL DEFAULT 'dispatcher_pro',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  carrier_id uuid,
  role text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  dot_number text NOT NULL,
  mc_number text,
  legal_name text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  portal_status text NOT NULL DEFAULT 'not_invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, dot_number)
);

CREATE TABLE IF NOT EXISTS brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mc_number text UNIQUE NOT NULL,
  legal_name text,
  trust_score numeric(5,2) DEFAULT 60,
  trust_score_source text DEFAULT 'fmcsa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  carrier_id uuid NOT NULL REFERENCES carriers(id),
  broker_id uuid REFERENCES brokers(id),
  load_rate numeric(10,2) NOT NULL,
  miles numeric(8,2),
  fuel_cost numeric(10,2),
  driver_pay numeric(10,2),
  tolls numeric(10,2),
  net_profit numeric(10,2),
  rpm numeric(6,2),
  net_rpm numeric(6,2),
  status text NOT NULL DEFAULT 'logged',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  load_id uuid REFERENCES loads(id),
  carrier_id uuid NOT NULL REFERENCES carriers(id),
  broker_id uuid REFERENCES brokers(id),
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid_date date,
  days_outstanding integer GENERATED ALWAYS AS (CURRENT_DATE - issued_date) STORED,
  follow_up_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS fmcsa_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_type text NOT NULL,
  dot_number text,
  mc_number text,
  response_json jsonb NOT NULL,
  http_status_code integer,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hour'
);

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_carriers_organization_id ON carriers(organization_id);
CREATE INDEX IF NOT EXISTS idx_loads_organization_id ON loads(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_days_outstanding ON invoices(days_outstanding);
CREATE INDEX IF NOT EXISTS idx_fmcsa_cache_dot_number ON fmcsa_cache(dot_number);
