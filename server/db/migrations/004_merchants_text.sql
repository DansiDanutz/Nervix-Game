-- Merchants are identified by the application's stable text ids too
-- (mer_1, or a provider subject). Convert merchants.id and every reference.

BEGIN;

ALTER TABLE memberships              DROP CONSTRAINT IF EXISTS memberships_merchant_id_fkey;
ALTER TABLE knowledge_sources        DROP CONSTRAINT IF EXISTS knowledge_sources_merchant_id_fkey;
ALTER TABLE merchant_app_connections DROP CONSTRAINT IF EXISTS merchant_app_connections_merchant_id_fkey;
ALTER TABLE products                 DROP CONSTRAINT IF EXISTS products_merchant_id_fkey;
ALTER TABLE orders                   DROP CONSTRAINT IF EXISTS orders_merchant_id_fkey;
ALTER TABLE campaigns                DROP CONSTRAINT IF EXISTS campaigns_merchant_id_fkey;

ALTER TABLE merchants                ALTER COLUMN id TYPE text;
ALTER TABLE memberships              ALTER COLUMN merchant_id TYPE text;
ALTER TABLE knowledge_sources        ALTER COLUMN merchant_id TYPE text;
ALTER TABLE merchant_app_connections ALTER COLUMN merchant_id TYPE text;
ALTER TABLE products                 ALTER COLUMN merchant_id TYPE text;
ALTER TABLE orders                   ALTER COLUMN merchant_id TYPE text;
ALTER TABLE campaigns                ALTER COLUMN merchant_id TYPE text;

ALTER TABLE memberships              ADD CONSTRAINT memberships_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources        ADD CONSTRAINT knowledge_sources_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;
ALTER TABLE merchant_app_connections ADD CONSTRAINT merchant_app_connections_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;
ALTER TABLE products                 ADD CONSTRAINT products_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;
ALTER TABLE orders                   ADD CONSTRAINT orders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id);
ALTER TABLE campaigns                ADD CONSTRAINT campaigns_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;

COMMIT;