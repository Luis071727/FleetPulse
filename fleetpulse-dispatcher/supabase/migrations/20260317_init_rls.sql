ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmcsa_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_read ON organizations FOR SELECT USING (true);

CREATE POLICY users_org_read ON users
  FOR SELECT USING (organization_id::text = current_setting('request.jwt.claim.organization_id', true));

CREATE POLICY carriers_org_rw ON carriers
  FOR ALL USING (organization_id::text = current_setting('request.jwt.claim.organization_id', true));

CREATE POLICY loads_org_rw ON loads
  FOR ALL USING (organization_id::text = current_setting('request.jwt.claim.organization_id', true));

CREATE POLICY invoices_org_rw ON invoices
  FOR ALL USING (organization_id::text = current_setting('request.jwt.claim.organization_id', true));

CREATE POLICY carrier_self_load_read ON loads
  FOR SELECT USING (carrier_id::text = current_setting('request.jwt.claim.carrier_id', true));

CREATE POLICY carrier_self_invoice_read ON invoices
  FOR SELECT USING (carrier_id::text = current_setting('request.jwt.claim.carrier_id', true));

CREATE POLICY fmcsa_cache_read ON fmcsa_cache FOR SELECT USING (true);
