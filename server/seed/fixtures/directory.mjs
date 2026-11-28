/**
 * DEMO directory merchants (B3): four more verified merchants, each with a
 * published house on its own fixture plot, so GET /world/houses lists more
 * than the two slice houses. Fictional names, test/demo data only: no real
 * merchants, payments or production records. Idempotent; moderation state
 * (suspended, verified_at) is set only on insert, so re-seeding never undoes
 * an admin suspension. Plot ids follow shared/contracts/house-plots.json.
 */

// [key, merchant name, accent]; ids derive from the key (usr_/mer_/prop_demo_<key>).
export const DIRECTORY_MERCHANTS = Object.freeze([
  ["lantern", "Lantern Books (demo)", "#c98b3a"],
  ["kettle", "Copper Kettle Tea (demo)", "#b4643c"],
  ["juniper", "Juniper Florist (demo)", "#5f8a4e"],
  ["atlas", "Atlas Map Room (demo)", "#3f6f8f"],
]);

/** Contract street plots after the slice houses (slot-11..13) and the test plot (slot-14). */
const FIRST_PLOT = 15;
const PLOT_SORT_ORDER = 900;

export const DIRECTORY_HOUSES = Object.freeze(DIRECTORY_MERCHANTS.map(([key, name, accent], i) => Object.freeze({
  userId: `usr_demo_${key}`,
  merchantId: `mer_demo_${key}`,
  propertyId: `prop_demo_${key}`,
  plotId: `slot-${FIRST_PLOT + i}`,
  name,
  accent,
})));

async function applyHouse(q, h) {
  await q(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
           VALUES ($1, $2, $3, 'player', true, true)
           ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, email_verified = true, profile_completed = true`,
    [h.userId, `${h.userId}@fixture.nervix.invalid`, h.name]);
  await q(`INSERT INTO plots (id, district, template, sort_order) VALUES ($1, 'merchant-quarter', 'merchant_house', $2)
           ON CONFLICT (id) DO NOTHING`, [h.plotId, PLOT_SORT_ORDER]);
  await q(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at, suspended)
           VALUES ($1, $2, 'merchant', $3, now(), false)
           ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id, name = excluded.name`, [h.merchantId, h.userId, h.name]);
  await q(`INSERT INTO properties (id, owner_id, merchant_id, plot_id, slot_id, district, template, address, palette, published)
           VALUES ($1, $2, $3, $4, $4, 'merchant-quarter', 'merchant_house', $4, $5, true)
           ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id, merchant_id = excluded.merchant_id, plot_id = excluded.plot_id`,
    [h.propertyId, h.userId, h.merchantId, h.plotId, h.accent]);
}

export async function applyDirectoryHouses(q) {
  for (const house of DIRECTORY_HOUSES) await applyHouse(q, house);
}
