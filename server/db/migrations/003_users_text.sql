-- Users are identified by the application's stable text ids as well
-- (demo_<id>, or a provider subject). Convert users.id and every reference.

BEGIN;

ALTER TABLE external_accounts DROP CONSTRAINT IF EXISTS external_accounts_user_id_fkey;
ALTER TABLE avatars          DROP CONSTRAINT IF EXISTS avatars_user_id_fkey;
ALTER TABLE memberships      DROP CONSTRAINT IF EXISTS memberships_user_id_fkey;
ALTER TABLE merchants        DROP CONSTRAINT IF EXISTS merchants_owner_id_fkey;
ALTER TABLE properties       DROP CONSTRAINT IF EXISTS properties_owner_id_fkey;
ALTER TABLE orders           DROP CONSTRAINT IF EXISTS orders_buyer_id_fkey;
ALTER TABLE entitlements     DROP CONSTRAINT IF EXISTS entitlements_user_id_fkey;
ALTER TABLE progress         DROP CONSTRAINT IF EXISTS progress_user_id_fkey;
ALTER TABLE audit_events     DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;

ALTER TABLE users              ALTER COLUMN id TYPE text;
ALTER TABLE external_accounts  ALTER COLUMN user_id TYPE text;
ALTER TABLE avatars            ALTER COLUMN user_id TYPE text;
ALTER TABLE memberships        ALTER COLUMN user_id TYPE text;
ALTER TABLE merchants          ALTER COLUMN owner_id TYPE text;
ALTER TABLE properties         ALTER COLUMN owner_id TYPE text;
ALTER TABLE orders             ALTER COLUMN buyer_id TYPE text;
ALTER TABLE entitlements       ALTER COLUMN user_id TYPE text;
ALTER TABLE progress           ALTER COLUMN user_id TYPE text;
ALTER TABLE audit_events       ALTER COLUMN actor_id TYPE text;

ALTER TABLE external_accounts ADD CONSTRAINT external_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE avatars         ADD CONSTRAINT avatars_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE memberships     ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE merchants       ADD CONSTRAINT merchants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
ALTER TABLE properties      ADD CONSTRAINT properties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
ALTER TABLE orders          ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES users(id);
ALTER TABLE entitlements    ADD CONSTRAINT entitlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE progress        ADD CONSTRAINT progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE audit_events    ADD CONSTRAINT audit_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id);

COMMIT;