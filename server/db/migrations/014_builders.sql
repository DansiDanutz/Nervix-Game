BEGIN;
CREATE TABLE IF NOT EXISTS builders (
  id          text PRIMARY KEY,
  owner_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  app_url     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS builder_offerings (
  id           text PRIMARY KEY,
  builder_id   text NOT NULL REFERENCES builders(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  price_minor  integer NOT NULL CHECK (price_minor >= 0),
  currency     text NOT NULL,
  app_url      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offerings_builder_idx ON builder_offerings (builder_id);
COMMIT;
