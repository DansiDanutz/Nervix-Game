/** Fixture demo listings with their display category (018). Test/demo data only. */

// [id, builder, name, description, priceMinor, category]; categories are contract ids.
// Re-seeding fills a NULL category only; a category an owner set on a fixture row is kept.
export const OFFERINGS = Object.freeze([
  ["off_dangg_1", "bld_dangg", "DanGG Table Seat", "Sample seating (demo listing).", 1750, "seat"],
  ["off_dangg_2", "bld_dangg", "DanGG Starter Bundle", "Sample bundle (demo listing).", 3999, "bundle"],
  ["off_test_1", "bld_test", "Test Builder Widget", "Local test listing (demo).", 750, "merch"],
]);

export async function applyOfferings(q) {
  for (const [id, builder, name, description, price, category] of OFFERINGS) {
    await q(`INSERT INTO builder_offerings (id, builder_id, name, description, price_minor, currency, category)
             VALUES ($1, $2, $3, $4, $5, 'EUR', $6)
             ON CONFLICT (id) DO UPDATE SET category = COALESCE(builder_offerings.category, excluded.category)`,
      [id, builder, name, description, price, category]);
  }
}
