-- C9: presence privacy settings, one row per user (absent = names visible, D10).
--   hide_name  others see "Anonymous" instead of the display name
--   anonymous  hide_name, and the saved avatar preset is replaced per connection
-- Only the session user writes their own row (PUT /me/privacy). Nothing else is stored.
BEGIN;
CREATE TABLE IF NOT EXISTS presence_settings (
  user_id    text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hide_name  boolean NOT NULL DEFAULT false,
  anonymous  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
