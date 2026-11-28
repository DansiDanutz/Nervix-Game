-- Nervix World initial schema.
-- Money is integer minor units with an ISO-4217 currency; never float.
-- Ownership (merchant_id / user_id) is carried on every business record.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'player'
                  CHECK (role IN ('player', 'merchant_owner', 'merchant_staff', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE external_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  provider_uid  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE TABLE avatars (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE districts (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  slot_count    integer NOT NULL DEFAULT 0
);

CREATE TABLE merchants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id),
  business_type text NOT NULL CHECK (business_type IN ('merchant', 'cafe', 'gaming')),
  name          text NOT NULL,
  profile       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner', 'staff')),
  PRIMARY KEY (merchant_id, user_id)
);

CREATE TABLE properties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id),
  slot_id       text NOT NULL UNIQUE,
  district      text NOT NULL REFERENCES districts(id),
  template      text NOT NULL,
  address       text NOT NULL,
  published     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

CREATE TABLE agent_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  name            text NOT NULL,
  tone            text NOT NULL DEFAULT 'warm',
  languages       text[] NOT NULL DEFAULT ARRAY['en', 'ro'],
  knowledge       jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_actions text[] NOT NULL DEFAULT ARRAY['search_catalog', 'read_product'],
  monthly_budget_minor integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  uri           text,
  content       text,
  approved      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apps (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  category      text NOT NULL,
  integration   text NOT NULL,
  auth_required boolean NOT NULL DEFAULT false,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE merchant_app_connections (
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  app_id        text NOT NULL REFERENCES apps(id),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials   jsonb NOT NULL DEFAULT '{}'::jsonb,
  health        text NOT NULL DEFAULT 'unknown',
  PRIMARY KEY (merchant_id, app_id)
);

CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sku           text NOT NULL,
  name          text NOT NULL,
  description   text,
  unit_amount_minor integer NOT NULL CHECK (unit_amount_minor >= 0),
  currency      text NOT NULL,
  fulfillment   text NOT NULL CHECK (fulfillment IN ('digital', 'appointment', 'delivery', 'pickup')),
  active        boolean NOT NULL DEFAULT true,
  UNIQUE (merchant_id, sku)
);

CREATE TABLE orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id      uuid NOT NULL REFERENCES users(id),
  merchant_id   uuid NOT NULL REFERENCES merchants(id),
  currency      text NOT NULL,
  total_minor   integer NOT NULL CHECK (total_minor >= 0),
  fulfillment   text NOT NULL,
  state         text NOT NULL DEFAULT 'created'
                  CHECK (state IN ('created','pending_payment','paid','fulfilled','failed','cancelled','expired')),
  terms         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id),
  sku           text NOT NULL,
  name          text NOT NULL,
  unit_amount_minor integer NOT NULL,
  quantity      integer NOT NULL CHECK (quantity > 0),
  line_total_minor integer NOT NULL,
  PRIMARY KEY (order_id, sku)
);

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  provider_ref  text,
  amount_minor  integer NOT NULL,
  currency      text NOT NULL,
  state         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_events (
  event_id      text PRIMARY KEY,
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type          text NOT NULL,
  payload       jsonb,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entitlements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id      uuid REFERENCES orders(id),
  kind          text NOT NULL,
  ref           text,
  granted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ad_placements (
  id            text PRIMARY KEY,
  district      text NOT NULL REFERENCES districts(id),
  kind          text NOT NULL,
  slot_id       text NOT NULL,
  price_minor   integer NOT NULL CHECK (price_minor >= 0),
  currency      text NOT NULL
);

CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  placement_id  text NOT NULL REFERENCES ad_placements(id),
  creative      jsonb NOT NULL DEFAULT '{}'::jsonb,
  state         text NOT NULL DEFAULT 'draft'
                  CHECK (state IN ('draft','awaiting_payment','scheduled','active','paused','expired','cancelled')),
  starts_at     timestamptz,
  ends_at       timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quests (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  steps         jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE progress (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id      text NOT NULL REFERENCES quests(id),
  step_index    integer NOT NULL DEFAULT 0,
  completed     boolean NOT NULL DEFAULT false,
  seals         jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (user_id, quest_id)
);

CREATE TABLE audit_events (
  id            bigserial PRIMARY KEY,
  actor_id      uuid REFERENCES users(id),
  action        text NOT NULL,
  subject       text,
  detail        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON orders (merchant_id, state);
CREATE INDEX ON orders (buyer_id);
CREATE INDEX ON campaigns (placement_id, state);
CREATE INDEX ON properties (district, slot_id);

COMMIT;