-- B1: plot registry and house binding.
-- A plot is a buildable lot tied to a Blender door; its id is the former slot
-- id, so the slice manifest, fixtures and existing properties keep working.
-- The database enforces: one house per plot, one house per merchant, and a
-- house (or catalogue) bound to a merchant has that merchant's owner.
-- Existing rows that break a rule lose the binding (fail closed), never data.
-- A legacy house whose district disagrees with its seeded plot aborts the
-- migration (fail loudly) instead of being silently inconsistent.
-- Re-runnable: every step is guarded (IF NOT EXISTS / ON CONFLICT / pg_constraint).
BEGIN;

INSERT INTO districts (id, name, slot_count) VALUES
  ('merchant-quarter', 'Merchant Quarter', 8),
  ('coffee-courtyard', 'Coffee Courtyard', 4),
  ('entertainment-district', 'Entertainment District', 2)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS plots (
  id          text PRIMARY KEY,
  district    text NOT NULL REFERENCES districts(id),
  template    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The former hard-coded SLOTS (src/routes/context.mjs), same ids and order.
INSERT INTO plots (id, district, template, sort_order)
SELECT 'slot-' || lpad(n::text, 2, '0'), 'merchant-quarter', 'merchant_house', n FROM generate_series(1, 8) AS n
UNION ALL
SELECT 'cafe-' || n, 'coffee-courtyard', 'cafe_shop', 100 + n FROM generate_series(1, 4) AS n
UNION ALL
SELECT 'venue-' || n, 'entertainment-district', 'casino_venue', 200 + n FROM generate_series(1, 2) AS n
ON CONFLICT (id) DO NOTHING;

-- Every existing house keeps its slot as a plot.
INSERT INTO plots (id, district, template, sort_order)
SELECT slot_id, district, template, 1000 FROM properties
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE bad record;
BEGIN
  SELECT p.id, p.district, p.slot_id, pl.district AS plot_district INTO bad
    FROM properties p JOIN plots pl ON pl.id = p.slot_id
   WHERE pl.district <> p.district
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '017: house % is in district % but its plot % is in district %',
      bad.id, bad.district, bad.slot_id, bad.plot_district;
  END IF;
END $$;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS plot_id text REFERENCES plots(id);
UPDATE properties SET plot_id = slot_id WHERE plot_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_plot_id_key') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_plot_id_key UNIQUE (plot_id);
  END IF;
  -- Owner check: (merchant_id, owner_id) must name one merchant row.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchants_id_owner_key') THEN
    ALTER TABLE merchants ADD CONSTRAINT merchants_id_owner_key UNIQUE (id, owner_id);
  END IF;
END $$;

UPDATE properties p SET merchant_id = NULL
 WHERE merchant_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM merchants m WHERE m.id = p.merchant_id AND m.owner_id = p.owner_id);
UPDATE properties p SET merchant_id = NULL
 WHERE merchant_id IS NOT NULL
   AND p.id <> (SELECT min(p2.id) FROM properties p2 WHERE p2.merchant_id = p.merchant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_merchant_owner_fkey') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_merchant_owner_fkey
      FOREIGN KEY (merchant_id, owner_id) REFERENCES merchants (id, owner_id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS properties_one_house_per_merchant ON properties (merchant_id) WHERE merchant_id IS NOT NULL;

-- Catalogues bind to a merchant, so a house shows exactly one catalogue.
ALTER TABLE builders ADD COLUMN IF NOT EXISTS merchant_id text;
UPDATE builders b SET merchant_id = p.merchant_id
  FROM properties p
 WHERE p.owner_id = b.owner_id AND p.merchant_id IS NOT NULL AND b.merchant_id IS NULL
   AND b.id = (SELECT min(b2.id) FROM builders b2 WHERE b2.owner_id = b.owner_id)
   AND NOT EXISTS (SELECT 1 FROM builders o WHERE o.merchant_id = p.merchant_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'builders_merchant_owner_fkey') THEN
    ALTER TABLE builders ADD CONSTRAINT builders_merchant_owner_fkey
      FOREIGN KEY (merchant_id, owner_id) REFERENCES merchants (id, owner_id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS builders_one_per_merchant ON builders (merchant_id) WHERE merchant_id IS NOT NULL;

COMMIT;
