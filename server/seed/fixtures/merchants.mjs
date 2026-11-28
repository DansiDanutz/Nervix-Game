/** Fixture merchants and their houses (properties). Test/demo data only. */

// [id, owner, name, verified]
export const MERCHANTS = Object.freeze([
  ["mer_dangg", "usr_dangg", "DanGG", true],
  ["mer_test", "usr_test", "Test Builder", true],
  ["mer_unverified", "usr_unverified", "Unverified Shop", false],
]);

// [propertyId, owner, merchant, plot]; the plot id is also the legacy slot id.
export const PROPERTIES = Object.freeze([
  ["prop_dangg", "usr_dangg", "mer_dangg", "slot-11"],
  ["prop_test", "usr_test", "mer_test", "slot-12"],
  ["prop_unverified", "usr_unverified", "mer_unverified", "slot-13"],
]);

export async function applyDistricts(q) {
  await q(`INSERT INTO districts (id, name, slot_count) VALUES ('merchant-quarter', 'Merchant Quarter', 8)
           ON CONFLICT (id) DO NOTHING`);
}

/** Fixture plots for the fixture houses (migration 017 seeds the district's own plots). */
export async function applyPlots(q) {
  for (const [, , , plot] of PROPERTIES) {
    await q(`INSERT INTO plots (id, district, template, sort_order) VALUES ($1, 'merchant-quarter', 'merchant_house', 900)
             ON CONFLICT (id) DO NOTHING`, [plot]);
  }
}

export async function applyMerchants(q) {
  for (const [id, owner, name, verified] of MERCHANTS) {
    await q(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at, suspended)
             VALUES ($1, $2, 'merchant', $3, CASE WHEN $4 THEN now() END, false)
             ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id, name = excluded.name,
               verified_at = CASE WHEN $4 THEN COALESCE(merchants.verified_at, now()) END, suspended = false`,
      [id, owner, name, verified]);
  }
}

export async function applyProperties(q) {
  for (const [id, owner, merchant, plot] of PROPERTIES) {
    await q(`INSERT INTO properties (id, owner_id, merchant_id, plot_id, slot_id, district, template, address, published)
             VALUES ($1, $2, $3, $4, $4, 'merchant-quarter', 'merchant_house', $4, true)
             ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id, merchant_id = excluded.merchant_id,
               plot_id = excluded.plot_id`,
      [id, owner, merchant, plot]);
  }
}
