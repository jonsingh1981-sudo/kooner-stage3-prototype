-- Stage 6 persistence for approved Stage 5 Portal actions.
ALTER TABLE customer_messages ADD COLUMN IF NOT EXISTS legacy_ref text;
ALTER TABLE customer_messages ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_messages_legacy_ref
  ON customer_messages(legacy_ref) WHERE legacy_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_messages_wo_time
  ON customer_messages(work_order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS portal_user_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_name text NOT NULL,
  requested_email text NOT NULL,
  requested_role text NOT NULL,
  requested_site_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'Operations Review',
  decision_reason text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_user_requests_customer_status
  ON portal_user_requests(customer_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_data_change_status
  ON customer_data_change_requests(customer_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_actions_status
  ON portal_actions(status,created_at DESC);
