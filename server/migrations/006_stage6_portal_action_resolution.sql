-- Stage 6 Portal Action resolution audit hardening.
-- Keeps queue status tied to an explicit authorised outcome/user/time without
-- relying only on free-form JSON metadata.

ALTER TABLE portal_actions
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_portal_actions_resolution
  ON portal_actions(status,resolved_at DESC);
