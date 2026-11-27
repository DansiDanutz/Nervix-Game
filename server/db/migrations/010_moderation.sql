-- Merchant suspension is a platform decision, audited like every admin action.
BEGIN;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC);
COMMIT;
