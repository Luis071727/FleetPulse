-- Grant table permissions to service_role and authenticated roles.
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

-- service_role: full access (used by the backend)
GRANT ALL ON TABLE public.organizations TO service_role;
GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.carriers TO service_role;
GRANT ALL ON TABLE public.brokers TO service_role;
GRANT ALL ON TABLE public.loads TO service_role;
GRANT ALL ON TABLE public.invoices TO service_role;
GRANT ALL ON TABLE public.fmcsa_cache TO service_role;

-- authenticated: needed for RLS policies to work for logged-in users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.carriers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brokers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;
GRANT SELECT ON TABLE public.fmcsa_cache TO authenticated;

-- anon: read-only on public tables (if needed)
GRANT SELECT ON TABLE public.organizations TO anon;
GRANT SELECT ON TABLE public.fmcsa_cache TO anon;

-- ── RLS policies for write operations ──
-- The original init_rls.sql only created SELECT and org-scoped policies.
-- These fill the gaps so that INSERT/UPDATE work through the Supabase API.

-- Organizations: allow inserts and updates (signup creates orgs)
CREATE POLICY IF NOT EXISTS organizations_insert ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS organizations_update ON organizations FOR UPDATE USING (true);

-- Users: allow inserts and updates (signup creates user rows)
CREATE POLICY IF NOT EXISTS users_insert ON users FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS users_update ON users FOR UPDATE USING (true);

-- Brokers: shared table — allow read/write for everyone
CREATE POLICY IF NOT EXISTS brokers_read ON brokers FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS brokers_insert ON brokers FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS brokers_update ON brokers FOR UPDATE USING (true);

-- FMCSA cache: needs insert/update for caching
CREATE POLICY IF NOT EXISTS fmcsa_cache_insert ON fmcsa_cache FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS fmcsa_cache_update ON fmcsa_cache FOR UPDATE USING (true);
