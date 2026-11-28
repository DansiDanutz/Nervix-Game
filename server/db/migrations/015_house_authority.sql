-- Merchant verification and per-house customisation.
-- A house is bound to one merchant; only that verified merchant's owner may
-- customise it (enforced in src/house-authority.mjs). Merchant identity and
-- catalog stay in the database and load at runtime; nothing is baked into Blender.
BEGIN;
ALTER TABLE merchants  ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS merchant_id text REFERENCES merchants(id);
CREATE INDEX IF NOT EXISTS properties_merchant_idx ON properties (merchant_id);
CREATE INDEX IF NOT EXISTS merchants_owner_idx ON merchants (owner_id);
CREATE TABLE IF NOT EXISTS house_profiles (
  property_id  text PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  welcome      text CHECK (welcome IS NULL OR char_length(welcome) <= 280),
  decor        jsonb NOT NULL DEFAULT '{}'::jsonb,
  display      jsonb NOT NULL DEFAULT '{}'::jsonb,
  website_url  text,
  updated_by   text REFERENCES users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMIT;
