-- Merchant-selectable colour palette for a property template.
BEGIN;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS palette text NOT NULL DEFAULT '#e8dcc0';
COMMIT;
