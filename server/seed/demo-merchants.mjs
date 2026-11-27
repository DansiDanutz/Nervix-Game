#!/usr/bin/env node
/**
 * Emit idempotent seed SQL for demo merchants.
 *
 * The database is not reachable from this environment, so this script prints SQL
 * instead of connecting. Apply with:
 *   node seed/demo-merchants.mjs | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
 *
 * Demo only: no real merchant data, no credentials.
 */

const merchants = [
  { key: "cafe", name: "The Copper Cup", business_type: "cafe", district: "coffee-courtyard", slot: "slot-03", template: "cafe_shop" },
  { key: "house", name: "Mira's Workshop", business_type: "merchant", district: "merchant-quarter", slot: "slot-01", template: "merchant_house" },
  { key: "venue", name: "The Gilded Arch", business_type: "gaming", district: "entertainment-district", slot: "slot-07", template: "casino_venue" },
];

const sql = [];
sql.push("BEGIN;");
sql.push(`INSERT INTO districts (id, name, slot_count) VALUES
  ('central-plaza', 'Central Plaza', 0),
  ('merchant-quarter', 'Merchant Quarter', 8),
  ('coffee-courtyard', 'Coffee Courtyard', 4),
  ('entertainment-district', 'Entertainment District', 2)
ON CONFLICT (id) DO NOTHING;`);

for (const m of merchants) {
  const userId = `'00000000-0000-4000-8000-00000000000${m.key.length}'::uuid`;
  sql.push(`INSERT INTO users (id, email, display_name, role) VALUES (${userId}, '${m.key}@demo.nervix.invalid', '${m.name}', 'merchant_owner')
  ON CONFLICT (email) DO NOTHING;`);
  sql.push(`INSERT INTO merchants (id, owner_id, business_type, name) VALUES ('00000000-0000-4000-8000-0000000000${m.key === "cafe" ? "1" : m.key === "house" ? "2" : "3"}'::uuid, ${userId}, '${m.business_type}', '${m.name}')
  ON CONFLICT DO NOTHING;`);
  sql.push(`INSERT INTO properties (owner_id, slot_id, district, template, address, published) VALUES (${userId}, '${m.slot}', '${m.district}', '${m.template}', '${m.district}/${m.slot}', true)
  ON CONFLICT (slot_id) DO NOTHING;`);
}

sql.push("COMMIT;");
process.stdout.write(sql.join("\n") + "\n");