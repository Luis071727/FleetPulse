ALTER TABLE invoices DROP COLUMN IF EXISTS days_outstanding;
DROP INDEX IF EXISTS idx_invoices_days_outstanding;

CREATE OR REPLACE FUNCTION invoice_on_load_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO invoices (organization_id, load_id, carrier_id, broker_id, amount, invoice_number, issued_date, status)
  VALUES (
    NEW.organization_id,
    NEW.id,
    NEW.carrier_id,
    NEW.broker_id,
    NEW.load_rate,
    COALESCE(NULLIF(BTRIM(NEW.rc_reference), ''), LEFT(NEW.id::text, 8)),
    CURRENT_DATE,
    'pending'
  );
  RETURN NEW;
END;
$$;
