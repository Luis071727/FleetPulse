CREATE OR REPLACE FUNCTION invoice_on_load_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO invoices (organization_id, load_id, carrier_id, broker_id, amount, issued_date, status)
  VALUES (NEW.organization_id, NEW.id, NEW.carrier_id, NEW.broker_id, NEW.load_rate, CURRENT_DATE, 'pending');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_on_load_insert ON loads;
CREATE TRIGGER trg_invoice_on_load_insert
AFTER INSERT ON loads
FOR EACH ROW
EXECUTE FUNCTION invoice_on_load_insert();
