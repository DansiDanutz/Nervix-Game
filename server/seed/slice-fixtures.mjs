/**
 * Fixtures for the first playable slice (plaza → OpenPoker → DanGG → plaza,
 * plus the independent Test Builder house). Test/demo data only: no real
 * payments, no production records. Idempotent.
 *
 *   DATABASE_URL=postgres:///nervix_world node seed/slice-fixtures.mjs
 *
 * Sessions are only meaningful with NODE_ENV=test and
 * NERVIX_WORLD_TEST_SUBSCRIBER=<SUBSCRIBERS joined by ","> on the server; the
 * real subscription source is not wired and fails closed.
 */

import pg from "pg";

export const SUBSCRIBERS = ["usr_dangg", "usr_test", "usr_sub", "usr_unverified"];

export const SESSIONS = Object.freeze({
  dangg: "sess_fixture_dangg",
  test: "sess_fixture_test",
  visitor: "sess_fixture_visitor",
  sub: "sess_fixture_sub",
  unverified: "sess_fixture_unverified",
  admin: "sess_fixture_admin",
});

const USERS = [
  ["usr_dangg", "DanGG", "player"],
  ["usr_test", "Test Builder", "player"],
  ["usr_visitor", "Visitor", "player"],
  ["usr_sub", "Subscriber Only", "player"],
  ["usr_unverified", "Unverified Merchant", "player"],
  ["usr_admin_fixture", "Fixture Admin", "admin"],
];

// [id, owner, name, verified]
const MERCHANTS = [
  ["mer_dangg", "usr_dangg", "DanGG", true],
  ["mer_test", "usr_test", "Test Builder", true],
  ["mer_unverified", "usr_unverified", "Unverified Shop", false],
];

// [propertyId, owner, merchant, slot]
const PROPERTIES = [
  ["prop_dangg", "usr_dangg", "mer_dangg", "slot-11"],
  ["prop_test", "usr_test", "mer_test", "slot-12"],
  ["prop_unverified", "usr_unverified", "mer_unverified", "slot-13"],
];

const BUILDERS = [
  ["bld_dangg", "usr_dangg", "DanGG", "https://dangg.live/"],
  ["bld_test", "usr_test", "Test Builder House", null],
];

const OFFERINGS = [
  ["off_dangg_1", "bld_dangg", "DanGG Table Seat", "Sample seating (demo listing).", 1750],
  ["off_dangg_2", "bld_dangg", "DanGG Starter Bundle", "Sample bundle (demo listing).", 3999],
  ["off_test_1", "bld_test", "Test Builder Widget", "Local test listing (demo).", 750],
];

export async function applySliceFixtures(pool) {
  const q = (sql, args) => pool.query(sql, args);
  await q(`INSERT INTO districts (id, name, slot_count) VALUES ('merchant-quarter', 'Merchant Quarter', 8)
           ON CONFLICT (id) DO NOTHING`);
  for (const [id, name, role] of USERS) {
    await q(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
             VALUES ($1, $2, $3, $4, true, true)
             ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, role = excluded.role,
               email_verified = true, profile_completed = true`,
      [id, `${id}@fixture.nervix.invalid`, name, role]);
  }
  for (const [id, owner, name, verified] of MERCHANTS) {
    await q(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at, suspended)
             VALUES ($1, $2, 'merchant', $3, CASE WHEN $4 THEN now() END, false)
             ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id, name = excluded.name,
               verified_at = CASE WHEN $4 THEN COALESCE(merchants.verified_at, now()) END, suspended = false`,
      [id, owner, name, verified]);
  }
  for (const [id, owner, merchant, slot] of PROPERTIES) {
    await q(`INSERT INTO properties (id, owner_id, merchant_id, slot_id, district, template, address, published)
             VALUES ($1, $2, $3, $4, 'merchant-quarter', 'merchant_house', $4, true)
             ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id, merchant_id = excluded.merchant_id`,
      [id, owner, merchant, slot]);
  }
  for (const [id, owner, name, appUrl] of BUILDERS) {
    await q(`INSERT INTO builders (id, owner_id, name, app_url) VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET owner_id = excluded.owner_id`,
      [id, owner, name, appUrl]);
  }
  for (const [id, builder, name, description, price] of OFFERINGS) {
    await q(`INSERT INTO builder_offerings (id, builder_id, name, description, price_minor, currency)
             VALUES ($1, $2, $3, $4, $5, 'EUR') ON CONFLICT (id) DO NOTHING`,
      [id, builder, name, description, price]);
  }
  const owners = { dangg: "usr_dangg", test: "usr_test", visitor: "usr_visitor", sub: "usr_sub", unverified: "usr_unverified", admin: "usr_admin_fixture" };
  for (const [key, sid] of Object.entries(SESSIONS)) {
    await q(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')
             ON CONFLICT (id) DO UPDATE SET expires_at = excluded.expires_at`, [sid, owners[key]]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });
  applySliceFixtures(pool)
    .then(() => console.log(`slice fixtures applied; subscribers for NODE_ENV=test: ${SUBSCRIBERS.join(",")}`))
    .catch((e) => {
      console.error("fixture error:", e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
