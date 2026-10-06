-- Stage 6 security hardening: allow explicit Customer-wide or Site-scoped user grants.
ALTER TABLE user_scopes DROP CONSTRAINT IF EXISTS user_scopes_pkey;
ALTER TABLE user_scopes ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE user_scopes ALTER COLUMN site_id DROP NOT NULL;

ALTER TABLE user_scopes DROP CONSTRAINT IF EXISTS user_scopes_shape_check;
ALTER TABLE user_scopes ADD CONSTRAINT user_scopes_shape_check CHECK (
  (scope_type='customer' AND customer_id IS NOT NULL AND site_id IS NULL)
  OR
  (scope_type='site' AND customer_id IS NOT NULL AND site_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_customer_scope
  ON user_scopes(user_id, customer_id)
  WHERE scope_type='customer';
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_site_scope
  ON user_scopes(user_id, site_id)
  WHERE scope_type='site';
CREATE INDEX IF NOT EXISTS idx_user_scopes_customer ON user_scopes(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_scopes_site ON user_scopes(site_id);

-- A Site scope must belong to the same Customer stored on the scope row.
CREATE OR REPLACE FUNCTION enforce_user_scope_customer_site_match() RETURNS trigger AS $$
BEGIN
  IF NEW.scope_type='site' THEN
    IF NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=NEW.site_id AND s.customer_id=NEW.customer_id) THEN
      RAISE EXCEPTION 'Site scope does not belong to Customer scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_scope_customer_site_match ON user_scopes;
CREATE TRIGGER trg_user_scope_customer_site_match
BEFORE INSERT OR UPDATE ON user_scopes
FOR EACH ROW EXECUTE FUNCTION enforce_user_scope_customer_site_match();

-- Supporting indexes for Stage 6 shared-state/security queries.
CREATE INDEX IF NOT EXISTS idx_work_orders_customer_site ON work_orders(customer_id,site_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_site ON vehicles(customer_id,current_site_id,registration);
CREATE INDEX IF NOT EXISTS idx_portal_requests_customer_site ON portal_requests(customer_id,site_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_scope ON documents(customer_id,site_id,visibility);
CREATE INDEX IF NOT EXISTS idx_sync_events_event_status ON sync_events(event_id,sync_status);
CREATE INDEX IF NOT EXISTS idx_labour_entries_work_order ON labour_time_entries(work_order_id,attendance_id,started_at);
