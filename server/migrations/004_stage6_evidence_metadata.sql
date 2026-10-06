-- Stage 6 approved Technician Evidence Metadata model.
CREATE TABLE IF NOT EXISTS evidence_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_ref text UNIQUE NOT NULL,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  attendance_id uuid REFERENCES attendances(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  evidence_type text NOT NULL,
  filename text,
  mime_type text,
  size_bytes bigint,
  checksum text,
  visibility text NOT NULL DEFAULT 'Internal Kooner Only',
  storage_key text,
  storage_status text NOT NULL DEFAULT 'Metadata Only',
  captured_by uuid REFERENCES users(id),
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'Technician Mobile',
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_evidence_work_order ON evidence_metadata(work_order_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_attendance ON evidence_metadata(attendance_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence_metadata(task_id,captured_at DESC);
