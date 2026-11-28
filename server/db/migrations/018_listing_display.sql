-- P1: how a listing is displayed in its house.
--   category      one of shared/contracts/product-categories.json ids (NULL = generic display)
--   display_slot  the merchant's chosen display position (NULL = unplaced); collisions are
--                 resolved deterministically when the house is read, never by the database
--   sort_order    tie-break for placement and list order
--   active        false hides the listing from visitors; only the house's verified owner sets it
-- Existing rows keep NULL category/slot, sort 0 and stay active.
BEGIN;
ALTER TABLE builder_offerings
  ADD COLUMN IF NOT EXISTS category     text,
  ADD COLUMN IF NOT EXISTS display_slot integer,
  ADD COLUMN IF NOT EXISTS sort_order   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active       boolean NOT NULL DEFAULT true;

ALTER TABLE builder_offerings DROP CONSTRAINT IF EXISTS builder_offerings_category_check;
ALTER TABLE builder_offerings ADD CONSTRAINT builder_offerings_category_check
  CHECK (category IS NULL OR category IN ('seat', 'bundle', 'digital', 'drink', 'food', 'merch', 'service'));

ALTER TABLE builder_offerings DROP CONSTRAINT IF EXISTS builder_offerings_display_slot_check;
ALTER TABLE builder_offerings ADD CONSTRAINT builder_offerings_display_slot_check
  CHECK (display_slot IS NULL OR display_slot BETWEEN 0 AND 31);

ALTER TABLE builder_offerings DROP CONSTRAINT IF EXISTS builder_offerings_sort_order_check;
ALTER TABLE builder_offerings ADD CONSTRAINT builder_offerings_sort_order_check
  CHECK (sort_order BETWEEN -10000 AND 10000);

CREATE INDEX IF NOT EXISTS offerings_builder_active_idx ON builder_offerings (builder_id) WHERE active;

-- P1 also fixes the cleared-welcome bug: a PATCH with welcome:null used to store the string "null".
UPDATE house_profiles SET welcome = NULL WHERE welcome = 'null';
COMMIT;
