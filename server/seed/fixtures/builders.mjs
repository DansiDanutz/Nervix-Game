/** Fixture builder catalogues and demo listings. Test/demo data only. */

// [id, owner, name, appUrl]
export const BUILDERS = Object.freeze([
  ["bld_dangg", "usr_dangg", "DanGG", "https://dangg.live/"],
  ["bld_test", "usr_test", "Test Builder House", null],
]);

// [id, builder, name, description, priceMinor]
export const OFFERINGS = Object.freeze([
  ["off_dangg_1", "bld_dangg", "DanGG Table Seat", "Sample seating (demo listing).", 1750],
  ["off_dangg_2", "bld_dangg", "DanGG Starter Bundle", "Sample bundle (demo listing).", 3999],
  ["off_test_1", "bld_test", "Test Builder Widget", "Local test listing (demo).", 750],
]);

export async function applyBuilders(q) {
  for (const [id, owner, name, appUrl] of BUILDERS) {
    await q(`INSERT INTO builders (id, owner_id, name, app_url) VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id`,
      [id, owner, name, appUrl]);
  }
}

export async function applyOfferings(q) {
  for (const [id, builder, name, description, price] of OFFERINGS) {
    await q(`INSERT INTO builder_offerings (id, builder_id, name, description, price_minor, currency)
             VALUES ($1, $2, $3, $4, $5, 'EUR') ON CONFLICT (id) DO NOTHING`,
      [id, builder, name, description, price]);
  }
}
