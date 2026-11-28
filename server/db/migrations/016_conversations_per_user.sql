-- S3: merchant conversations are private to one visitor.
-- Each (property, user) pair has its own history and support requests. The user
-- comes from the session, never from the request body. The old per-property
-- `conversations` table is kept untouched (read by nothing new, never dropped).

BEGIN;

CREATE TABLE IF NOT EXISTS user_conversations (
  property_id  text NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  history      jsonb NOT NULL DEFAULT '[]'::jsonb,
  support      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, user_id)
);

CREATE INDEX IF NOT EXISTS user_conversations_user_idx ON user_conversations (user_id);

COMMIT;
