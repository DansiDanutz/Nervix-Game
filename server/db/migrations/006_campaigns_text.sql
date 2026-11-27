-- Campaign ids are the application's stable text ids (cmp_1, cmp_pg).
-- No other table references campaigns.id, so this is a single ALTER.

BEGIN;

ALTER TABLE campaigns ALTER COLUMN id TYPE text;

COMMIT;