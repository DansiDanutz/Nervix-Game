-- Verified email identity.
-- A verification code is single-use and expires; matching an email alone never
-- grants access to an existing account.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS verification_codes (
  id           bigserial PRIMARY KEY,
  email        text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_codes_email_idx ON verification_codes (email, consumed_at);

COMMIT;