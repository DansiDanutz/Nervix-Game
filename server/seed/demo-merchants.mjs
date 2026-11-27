#!/usr/bin/env node
/**
 * Emit idempotent seed SQL for demo merchants.
 *
 * The database is not reachable from every environment, so this script prints
 * SQL instead of connecting. Apply with:
 *   node seed/demo-merchants.mjs | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
 *
 * Demo only: no real merchant data, no credentials.
 */

const merchants = [
  { n: "1", key: "cafe", name: "The Copper Cup", business_type: "cafe", district: "coffee-courtyard", slot: "slot-03", template: "cafe_shop" },
  { n: "2", key: "house", name: "Mira's Workshop", business_type: "merchant", district: "merchant-quarter", slot: "slot-01", template: "merchant_house" },
  { n: "3", key: "venue", name: "The Gilded Arch", business_type: "gaming", district: "entertainment-district", slot: "slot-07", template: "casino_venue" },
];

const userUuid = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const merchantUuid = (n) => `00000000-0000-4000-8000-00000000001${n}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const sql = [];
sql.push("BEGIN;");
sql.push(`INSERT INTO districts (id, name, slot_count) VALUES
  ('central-plaza', 'Central Plaza', 0),
  ('merchant-quarter', 'Merchant Quarter', 8),
  ('coffee-courtyard', 'Coffee Courtyard', 4),
  ('entertainment-district', 'Entertainment District', 2)
ON CONFLICT (id) DO NOTHING;`);

sql.push(`INSERT INTO apps (id, name, category, integration, auth_required, config_schema) VALUES
  ('booking', 'Booking Desk', 'appointments', 'server-api', true, '{"configFields":["calendar"]}'::jsonb),
  ('loyalty', 'Loyalty Card', 'retention', 'server-api', true, '{"configFields":["programme"]}'::jsonb),
  ('arcade', 'Arcade Table', 'entertainment', 'embedded', false, '{"configFields":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;`);

sql.push(`INSERT INTO quests (id, title, steps) VALUES ('lost-seals', 'The Lost Seals of the City',
  '[{"id":"find-fountain"},{"id":"meet-guide"},{"id":"seal-court"},{"id":"seal-cafe"},{"id":"seal-venue"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;`);

sql.push(`INSERT INTO ad_placements (id, district, kind, slot_id, price_minor, currency) VALUES
  ('plaza-1', 'central-plaza', 'noticeboard', 'slot-plaza-1', 5000, 'EUR'),
  ('cafe-9', 'coffee-courtyard', 'poster', 'slot-cafe-9', 2500, 'EUR')
ON CONFLICT (id) DO NOTHING;`);

for (const m of merchants) {
  const uid = userUuid(m.n);
  const mid = merchantUuid(m.n);
  sql.push(`INSERT INTO users (id, email, display_name, role) VALUES ('${uid}', ${q(m.key + '@demo.nervix.invalid')}, ${q(m.name)}, 'merchant_owner')
  ON CONFLICT (email) DO NOTHING;`);
  sql.push(`INSERT INTO merchants (id, owner_id, business_type, name) VALUES ('${mid}', '${uid}', ${q(m.business_type)}, ${q(m.name)})
  ON CONFLICT DO NOTHING;`);
  sql.push(`INSERT INTO properties (owner_id, slot_id, district, template, address, published) VALUES ('${uid}', '${m.slot}', '${m.district}', '${m.template}', '${m.district}/${m.slot}', true)
  ON CONFLICT (slot_id) DO NOTHING;`);
  sql.push(`INSERT INTO agent_configs (property_id, name, tone, languages, allowed_actions)
  SELECT id, '${m.key === "cafe" ? "Sana" : m.key === "house" ? "Mira" : "Vale"}', 'warm', ARRAY['en','ro'],
         ARRAY['search_catalog','read_product','read_instructions','read_eligible_order','prepare_cart','create_checkout','request_support']
  FROM properties WHERE slot_id = '${m.slot}' ON CONFLICT (property_id) DO NOTHING;`);
}

sql.push("COMMIT;");
process.stdout.write(sql.join("\n") + "\n");