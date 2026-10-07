-- Stage 6 business-rule hardening.
-- Adds optimistic concurrency/versioning to Technician Labour Review records
-- without rewriting the already-applied foundation migration.

ALTER TABLE technician_labour_reviews
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_labour_review_work_order_status
  ON technician_labour_reviews(work_order_id,status);

ALTER TABLE technician_labour_reviews
  DROP CONSTRAINT IF EXISTS technician_labour_reviews_minutes_nonnegative;

ALTER TABLE technician_labour_reviews
  ADD CONSTRAINT technician_labour_reviews_minutes_nonnegative CHECK (
    actual_minutes >= 0
    AND (expected_minutes IS NULL OR expected_minutes >= 0)
    AND proposed_billable_minutes >= 0
    AND (approved_billable_minutes IS NULL OR approved_billable_minutes >= 0)
  );
