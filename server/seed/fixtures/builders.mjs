/** Fixture builder catalogues. Their demo listings are in offerings.mjs. Test/demo data only. */

// [id, owner, name, appUrl, merchant]; a catalogue shows in the house of its merchant (017).
export const BUILDERS = Object.freeze([
  ["bld_dangg", "usr_dangg", "DanGG", "https://dangg.live/", "mer_dangg"],
  ["bld_test", "usr_test", "Test Builder House", null, "mer_test"],
]);

export async function applyBuilders(q) {
  for (const [id, owner, name, appUrl, merchant] of BUILDERS) {
    await q(`INSERT INTO builders (id, owner_id, name, app_url, merchant_id) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id, merchant_id = excluded.merchant_id`,
      [id, owner, name, appUrl, merchant]);
  }
}
