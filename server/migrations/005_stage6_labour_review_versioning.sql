ALTER TABLE technician_labour_reviews
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_technician_labour_reviews_work_order_status
ON technician_labour_reviews(work_order_id, status);
