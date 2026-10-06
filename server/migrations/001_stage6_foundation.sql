CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS system_meta (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  user_type text NOT NULL CHECK (user_type IN ('internal','customer')),
  customer_id uuid,
  mfa_required boolean NOT NULL DEFAULT false,
  mfa_secret_encrypted text,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  role_type text NOT NULL CHECK (role_type IN ('internal','customer')),
  configurable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  name text NOT NULL,
  account_code text,
  status text NOT NULL DEFAULT 'Active',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_customer_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  name text NOT NULL,
  role_name text,
  email text,
  phone text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  name text NOT NULL,
  contract_type text,
  effective_from date,
  effective_to date,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);

CREATE TABLE IF NOT EXISTS contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id),
  version_no integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(contract_id, version_no)
);

CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  name text NOT NULL,
  address text,
  postcode text,
  status text NOT NULL DEFAULT 'Active',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sites_customer ON sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_sites_postcode ON sites(postcode);

CREATE TABLE IF NOT EXISTS site_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id),
  instruction_type text NOT NULL,
  instruction_text text NOT NULL,
  effective_from date,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_scopes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  site_id uuid REFERENCES sites(id),
  scope_type text NOT NULL CHECK (scope_type IN ('customer','site')),
  PRIMARY KEY(user_id, scope_type, customer_id, site_id)
);

CREATE TABLE IF NOT EXISTS billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  cycle_type text NOT NULL,
  cut_off_rule text,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  contract_id uuid REFERENCES contracts(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS pricing_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_rule_id uuid NOT NULL REFERENCES pricing_rules(id),
  version_no integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  labour_rate numeric(12,2) NOT NULL DEFAULT 0,
  parts_markup_percent numeric(8,4) NOT NULL DEFAULT 0,
  third_party_markup_percent numeric(8,4) NOT NULL DEFAULT 0,
  mileage_rate numeric(12,4) NOT NULL DEFAULT 0,
  vat_percent numeric(8,4) NOT NULL DEFAULT 20,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(pricing_rule_id, version_no)
);

CREATE TABLE IF NOT EXISTS fixed_maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  contract_id uuid REFERENCES contracts(id),
  name text NOT NULL,
  coverage_level text NOT NULL,
  pro_rata_rule text,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS effective_rate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES fixed_maintenance_plans(id),
  version_no integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  monthly_rate numeric(12,2) NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(plan_id, version_no)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  current_site_id uuid REFERENCES sites(id),
  registration text NOT NULL,
  vin text,
  unit_number text,
  make text,
  model text,
  vehicle_type text,
  current_mileage bigint,
  status text NOT NULL DEFAULT 'In Service',
  vor boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_reg_active ON vehicles(upper(registration)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_customer_site ON vehicles(customer_id,current_site_id);

CREATE TABLE IF NOT EXISTS vehicle_site_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  effective_from date NOT NULL,
  effective_to date,
  current boolean NOT NULL DEFAULT false,
  reason text,
  changed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_one_current_site ON vehicle_site_assignments(vehicle_id) WHERE current;

CREATE TABLE IF NOT EXISTS coverage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE,
  plan_id uuid NOT NULL REFERENCES fixed_maintenance_plans(id),
  vehicle_id uuid REFERENCES vehicles(id),
  group_ref text,
  fleet_ref text,
  effective_from date NOT NULL,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS mileage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  mileage bigint NOT NULL CHECK (mileage >= 0),
  source text NOT NULL,
  entered_by uuid REFERENCES users(id),
  work_order_id uuid,
  attendance_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  review_required boolean NOT NULL DEFAULT false,
  reason text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_mileage_vehicle_time ON mileage_history(vehicle_id,captured_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  requirement_type text NOT NULL,
  due_date date,
  due_mileage bigint,
  interval_days integer,
  interval_miles bigint,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  requirement_id uuid REFERENCES maintenance_requirements(id),
  event_type text NOT NULL,
  event_date date NOT NULL,
  mileage bigint,
  work_order_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS compliance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  compliance_type text NOT NULL,
  due_date date,
  status text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS vor_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  vor boolean NOT NULL,
  reason text,
  work_order_id uuid,
  recorded_by uuid REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  work_order_id uuid,
  description text NOT NULL,
  status text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  user_id uuid REFERENCES users(id),
  display_name text NOT NULL,
  role_name text,
  base_region text,
  status text,
  assigned_van text,
  benchmark_group text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS technician_skills (
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id),
  PRIMARY KEY(technician_id,skill_id)
);
CREATE TABLE IF NOT EXISTS qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS technician_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id),
  qualification_id uuid NOT NULL REFERENCES qualifications(id),
  expires_on date,
  reference text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS technician_cost_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id),
  effective_from date NOT NULL,
  effective_to date,
  hourly_cost numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE,
  technician_id uuid NOT NULL REFERENCES technicians(id),
  shift_date date NOT NULL,
  start_time time,
  end_time time,
  status text NOT NULL DEFAULT 'Active',
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_shifts_tech_date ON shifts(technician_id,shift_date);

CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id),
  availability_date date NOT NULL,
  status text NOT NULL,
  reason text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  contract_id uuid REFERENCES contracts(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  work_type text NOT NULL,
  priority text,
  fault_description text NOT NULL,
  status text NOT NULL,
  financial_status text NOT NULL DEFAULT 'Not Started',
  current_owner text,
  next_action text,
  due_at timestamptz,
  customer_reference text,
  vor boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wo_customer_site_status ON work_orders(customer_id,site_id,status);
CREATE INDEX IF NOT EXISTS idx_wo_vehicle ON work_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_wo_ref ON work_orders(legacy_ref);
CREATE INDEX IF NOT EXISTS idx_wo_po ON work_orders(customer_reference);

ALTER TABLE mileage_history DROP CONSTRAINT IF EXISTS mileage_history_work_order_id_fkey;
ALTER TABLE mileage_history ADD CONSTRAINT mileage_history_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE maintenance_events DROP CONSTRAINT IF EXISTS maintenance_events_work_order_id_fkey;
ALTER TABLE maintenance_events ADD CONSTRAINT maintenance_events_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE vor_history DROP CONSTRAINT IF EXISTS vor_history_work_order_id_fkey;
ALTER TABLE vor_history ADD CONSTRAINT vor_history_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE vehicle_defects DROP CONSTRAINT IF EXISTS vehicle_defects_work_order_id_fkey;
ALTER TABLE vehicle_defects ADD CONSTRAINT vehicle_defects_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);

CREATE TABLE IF NOT EXISTS work_order_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  contact_role text NOT NULL,
  contact_name text,
  phone text,
  email text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  attendance_type text NOT NULL,
  status text NOT NULL,
  planned_at timestamptz,
  arrived_at timestamptz,
  departed_at timestamptz,
  outcome text,
  version bigint NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_att_wo ON attendances(work_order_id);

ALTER TABLE mileage_history DROP CONSTRAINT IF EXISTS mileage_history_attendance_id_fkey;
ALTER TABLE mileage_history ADD CONSTRAINT mileage_history_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES attendances(id);

CREATE TABLE IF NOT EXISTS attendance_resource_assignments (
  attendance_id uuid NOT NULL REFERENCES attendances(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES technicians(id),
  assignment_role text NOT NULL DEFAULT 'Technician',
  PRIMARY KEY(attendance_id,technician_id)
);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id uuid NOT NULL REFERENCES workflow_templates(id),
  version_no integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  definition jsonb NOT NULL,
  UNIQUE(workflow_template_id,version_no)
);
CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  completion_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  task_template_id uuid REFERENCES task_templates(id),
  description text NOT NULL,
  task_type text NOT NULL,
  status text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  srt_expected_hours numeric(10,2),
  actual_hours numeric(10,2),
  version bigint NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_wo ON tasks(work_order_id);

CREATE TABLE IF NOT EXISTS task_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  question_code text NOT NULL,
  response jsonb NOT NULL,
  responded_by uuid REFERENCES users(id),
  responded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labour_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE,
  technician_id uuid NOT NULL REFERENCES technicians(id),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  attendance_id uuid NOT NULL REFERENCES attendances(id),
  task_id uuid REFERENCES tasks(id),
  activity_type text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_minutes integer,
  chargeability_review_required boolean NOT NULL DEFAULT false,
  chargeability_reason text,
  source text NOT NULL DEFAULT 'Technician Mobile',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repair_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  source text,
  active boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS srt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_operation_id uuid NOT NULL REFERENCES repair_operations(id),
  version_no integer NOT NULL,
  standard_hours numeric(10,2) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  source text,
  UNIQUE(repair_operation_id,version_no)
);

CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  status text NOT NULL,
  current_version_no integer NOT NULL DEFAULT 1,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS estimate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL,
  pricing_rule_version_id uuid REFERENCES pricing_rule_versions(id),
  net numeric(12,2) NOT NULL DEFAULT 0,
  vat numeric(12,2) NOT NULL DEFAULT 0,
  gross numeric(12,2) NOT NULL DEFAULT 0,
  scope text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(estimate_id,version_no)
);
CREATE TABLE IF NOT EXISTS estimate_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id uuid NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  line_type text NOT NULL,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_rate numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS estimate_approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id uuid NOT NULL REFERENCES estimate_versions(id),
  decision text NOT NULL,
  approver_user_id uuid REFERENCES users(id),
  approver_name text,
  method text,
  approved_amount numeric(12,2),
  scope text,
  evidence_reference text,
  comments text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS part_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  task_id uuid REFERENCES tasks(id),
  description text NOT NULL,
  part_number text,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  status text NOT NULL,
  purchase_cost numeric(12,2),
  supplier_reference text,
  chargeability text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS parts_used (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  attendance_id uuid REFERENCES attendances(id),
  task_id uuid REFERENCES tasks(id),
  description text NOT NULL,
  part_number text,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  purchase_cost numeric(12,2),
  recorded_by uuid REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS part_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  status text NOT NULL,
  supplier_reference text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid UNIQUE NOT NULL REFERENCES work_orders(id),
  status text NOT NULL,
  reviewer_user_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS technician_labour_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid REFERENCES labour_time_entries(id),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  attendance_id uuid REFERENCES attendances(id),
  task_id uuid REFERENCES tasks(id),
  technician_id uuid REFERENCES technicians(id),
  actual_minutes integer NOT NULL,
  expected_minutes integer,
  proposed_billable_minutes integer NOT NULL DEFAULT 0,
  approved_billable_minutes integer,
  pricing_rule_version_id uuid REFERENCES pricing_rule_versions(id),
  status text NOT NULL DEFAULT 'Pending Review',
  reviewer_user_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  override_reason text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS billing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  billing_account_id uuid REFERENCES billing_accounts(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  billing_run_id uuid REFERENCES billing_runs(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  explicit_site_id uuid REFERENCES sites(id),
  invoice_type text NOT NULL,
  status text NOT NULL,
  issue_date date,
  period_start date,
  period_end date,
  customer_reference text,
  net numeric(14,2) NOT NULL DEFAULT 0,
  vat numeric(14,2) NOT NULL DEFAULT 0,
  gross numeric(14,2) NOT NULL DEFAULT 0,
  locked_at timestamptz,
  locked_by uuid REFERENCES users(id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_invoice_customer_status ON invoices(customer_id,status);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_type text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  work_order_id uuid REFERENCES work_orders(id),
  site_id uuid REFERENCES sites(id),
  vehicle_id uuid REFERENCES vehicles(id),
  source_ref text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS credits_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id),
  work_order_id uuid REFERENCES work_orders(id),
  adjustment_type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  reason text NOT NULL,
  authorised_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS no_charge_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid UNIQUE NOT NULL REFERENCES work_orders(id),
  reason text NOT NULL,
  authorised_by uuid REFERENCES users(id),
  closed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  site_id uuid REFERENCES sites(id),
  vehicle_id uuid REFERENCES vehicles(id),
  submitted_by uuid REFERENCES users(id),
  request_type text NOT NULL,
  vehicle_status text,
  description text NOT NULL,
  status text NOT NULL,
  emergency boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  sender_user_id uuid REFERENCES users(id),
  source text NOT NULL,
  visibility text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  channel text NOT NULL DEFAULT 'Portal',
  PRIMARY KEY(user_id,event_code,channel)
);
CREATE TABLE IF NOT EXISTS customer_data_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  submitted_by uuid REFERENCES users(id),
  record_type text NOT NULL,
  record_ref text NOT NULL,
  current_value text,
  requested_value text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL,
  decision_reason text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS portal_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  action_type text NOT NULL,
  ref_type text,
  ref_id uuid,
  ref_legacy text,
  summary text NOT NULL,
  reason text,
  priority text,
  status text NOT NULL DEFAULT 'New',
  assigned_to uuid REFERENCES users(id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id),
  site_id uuid REFERENCES sites(id),
  vehicle_id uuid REFERENCES vehicles(id),
  work_order_id uuid REFERENCES work_orders(id),
  invoice_id uuid REFERENCES invoices(id),
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  checksum text,
  visibility text NOT NULL,
  allowed_role_codes text[] NOT NULL DEFAULT '{}',
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}',
  allowed_site_ids uuid[] NOT NULL DEFAULT '{}',
  storage_key text,
  storage_status text NOT NULL DEFAULT 'Metadata Only',
  uploaded_by uuid REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  entity_ref text,
  action text NOT NULL,
  user_id uuid REFERENCES users(id),
  user_role text,
  source text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  correlation_id uuid NOT NULL,
  ip_address text,
  device_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  request_hash text,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  technician_id uuid REFERENCES technicians(id),
  user_id uuid REFERENCES users(id),
  device_id text NOT NULL,
  work_order_id uuid REFERENCES work_orders(id),
  attendance_id uuid REFERENCES attendances(id),
  task_id uuid REFERENCES tasks(id),
  event_type text NOT NULL,
  event_timestamp timestamptz NOT NULL,
  device_capture_timestamp timestamptz NOT NULL,
  server_received_timestamp timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  base_version bigint,
  sync_status text NOT NULL,
  server_value jsonb,
  device_value jsonb,
  resolution jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_event_id uuid NOT NULL REFERENCES sync_events(id),
  entity_type text NOT NULL,
  entity_id uuid,
  server_version bigint,
  device_version bigint,
  server_value jsonb,
  device_value jsonb,
  status text NOT NULL DEFAULT 'Open',
  resolution text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS controlled_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_code text NOT NULL,
  item_code text NOT NULL,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  sort_order integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(list_code,item_code)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  code text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  customer_id uuid REFERENCES customers(id),
  environment text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Future Integration – Not Connected',
  enabled boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES integration_providers(id),
  event_type text NOT NULL,
  status text NOT NULL,
  source_reference text,
  payload jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  entity_ref text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Recorded – Provider Not Connected',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'Queued',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref text UNIQUE NOT NULL,
  import_type text NOT NULL,
  status text NOT NULL,
  created_by uuid REFERENCES users(id),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_key text NOT NULL,
  raw_data jsonb NOT NULL,
  mapped_data jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  UNIQUE(batch_id,row_key)
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text UNIQUE NOT NULL,
  retention_rule text,
  legal_hold_supported boolean NOT NULL DEFAULT true,
  verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Legal / Compliance Verification Required',
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS dcr_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dcr_ref text UNIQUE NOT NULL,
  area text NOT NULL,
  description text NOT NULL,
  item_type text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL,
  resolution text,
  retest_result text,
  deferred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dcr_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dcr_id uuid NOT NULL REFERENCES dcr_items(id) ON DELETE CASCADE,
  from_status text,
  to_status text,
  note text,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_meta(key,value) VALUES
('state_version','{"version":1}'::jsonb),
('application','{"name":"Kooner Fleet Management System","stage":6,"environment":"test"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
