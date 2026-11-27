-- Align identifier types with the stable text ids the application generates
-- (ord_1, prop_<hash>, agent_<hash>). Stable ids survive re-exports and retries;
-- the database must store them verbatim.

BEGIN;

ALTER TABLE order_items   DROP CONSTRAINT order_items_order_id_fkey;
ALTER TABLE payments      DROP CONSTRAINT payments_order_id_fkey;
ALTER TABLE payment_events DROP CONSTRAINT payment_events_order_id_fkey;
ALTER TABLE entitlements  DROP CONSTRAINT entitlements_order_id_fkey;

ALTER TABLE orders        ALTER COLUMN id TYPE text;
ALTER TABLE order_items   ALTER COLUMN order_id TYPE text;
ALTER TABLE payments      ALTER COLUMN order_id TYPE text;
ALTER TABLE payment_events ALTER COLUMN order_id TYPE text;
ALTER TABLE entitlements  ALTER COLUMN order_id TYPE text;

ALTER TABLE agent_configs DROP CONSTRAINT agent_configs_property_id_fkey;
ALTER TABLE properties    ALTER COLUMN id TYPE text;
ALTER TABLE agent_configs ALTER COLUMN property_id TYPE text;
ALTER TABLE agent_configs ADD CONSTRAINT agent_configs_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

COMMIT;