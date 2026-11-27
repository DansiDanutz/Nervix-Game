-- Persistent merchant conversations (history + support requests).
-- No foreign key in the demo so an unknown property id cannot break the API;
-- production should add REFERENCES properties(id) ON DELETE CASCADE.

BEGIN;

CREATE TABLE IF NOT EXISTS conversations (
  property_id  text PRIMARY KEY,
  history      jsonb NOT NULL DEFAULT '[]'::jsonb,
  support      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMIT;