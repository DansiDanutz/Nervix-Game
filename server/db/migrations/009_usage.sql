-- Metered agent usage per property and month.
BEGIN;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS monthly_request_cap integer;

CREATE TABLE IF NOT EXISTS agent_usage (
  property_id text NOT NULL,
  month       text NOT NULL,
  requests    integer NOT NULL DEFAULT 0,
  tokens      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (property_id, month)
);
COMMIT;
