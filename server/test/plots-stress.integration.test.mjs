/**
 * B1 repair: a signup burst well above the 10 the first tests used. With a
 * pool big enough that every allocation really runs concurrently, all of them
 * succeed (no 500 from exhausted retries) on distinct plots.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { allocateHouse } from "../src/store/plots.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";

const available = pgAvailable();
const BURST = 40;
const POOL_MAX = BURST + 5;

let db;
let pool;
const sql = async (text, values) => (await pool.query(text, values)).rows;

async function addMerchantUser(i) {
  const key = `b1s_${i}`;
  await sql(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
             VALUES ($1, $2, $1, 'player', true, true)`, [`usr_${key}`, `${key}@fixture.nervix.invalid`]);
  await sql(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at) VALUES ($1, $2, 'merchant', $1, now())`,
    [`mer_${key}`, `usr_${key}`]);
  return { userId: `usr_${key}`, merchantId: `mer_${key}` };
}

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_b1s" });
  pool = new pg.Pool({ connectionString: db.url, max: POOL_MAX });
  await sql(`INSERT INTO plots (id, district, template, sort_order)
             SELECT 'b1s-' || n, 'merchant-quarter', 'merchant_house', 500 + n FROM generate_series(1, $1::int) AS n`, [BURST]);
});

test.after(async () => {
  await pool?.end();
  db?.drop();
});

test(`${BURST} concurrent allocations all succeed on distinct plots`, { skip: available ? false : "Postgres not reachable at PGHOST" }, async () => {
  const callers = await Promise.all(Array.from({ length: BURST }, (_, i) => addMerchantUser(i)));
  const outcomes = await Promise.allSettled(callers.map((c) => allocateHouse({ pool }, { ...c, businessType: "merchant" })));
  const failed = outcomes.filter((o) => o.status === "rejected");
  assert.equal(failed.length, 0, String(failed[0]?.reason));
  const plots = outcomes.map((o) => o.value.property.plotId);
  assert.equal(new Set(plots).size, BURST);
  const stored = await sql("SELECT plot_id FROM properties WHERE owner_id = ANY($1)", [callers.map((c) => c.userId)]);
  assert.equal(new Set(stored.map((r) => r.plot_id)).size, BURST);
});
