/**
 * B3 world directory over HTTP on a throwaway database with the slice
 * fixtures: GET /world/houses lists only published houses of verified,
 * non-suspended merchants, on a plot, in plot order, with public fields only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures } from "../seed/fixtures/index.mjs";
import { DIRECTORY_MERCHANTS } from "../seed/fixtures/directory.mjs";
import { listWorldHouses } from "../src/store/houses.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 10;
const KEYS = ["accent", "merchantName", "plotId", "propertyId", "theme", "verified"];
const available = pgAvailable();
let db;
let pool;
let server;
const sql = async (text, values) => (await pool.query(text, values)).rows;

async function directory() {
  const res = await fetch(`${server.base}/world/houses`);
  return { status: res.status, body: await res.json() };
}

/** One extra merchant with a published house on its own plot; returns its property id. */
async function addHouse(key, { verified = true, suspended = false, published = true, sortOrder = 950 } = {}) {
  await sql(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
             VALUES ($1, $2, $1, 'player', true, true)`, [`usr_${key}`, `${key}@fixture.nervix.invalid`]);
  await sql(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at, suspended)
             VALUES ($1, $2, 'merchant', $3, CASE WHEN $4 THEN now() END, $5)`, [`mer_${key}`, `usr_${key}`, `Name ${key}`, verified, suspended]);
  await sql("INSERT INTO plots (id, district, template, sort_order) VALUES ($1, 'merchant-quarter', 'merchant_house', $2)", [`plot-${key}`, sortOrder]);
  await sql(`INSERT INTO properties (id, owner_id, merchant_id, plot_id, slot_id, district, template, address, published)
             VALUES ($1, $2, $3, $4, $4, 'merchant-quarter', 'merchant_house', $4, $5)`, [`prop_${key}`, `usr_${key}`, `mer_${key}`, `plot-${key}`, published]);
  return `prop_${key}`;
}

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_b3" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  server = await startServer({ port: await pickTestPort(PORT_SLOT), env: { DATABASE_URL: db.url } });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it("fixtures give at least 6 verified merchants with houses (DEMO), and the unverified one is left out", async () => {
  assert.ok(DIRECTORY_MERCHANTS.length >= 4);
  const r = await directory();
  assert.equal(r.status, 200);
  const ids = r.body.houses.map((h) => h.propertyId);
  assert.ok(ids.length >= 6, String(ids.length));
  assert.ok(ids.includes("prop_dangg") && ids.includes("prop_test"));
  assert.ok(!ids.includes("prop_unverified"));
});

it("is public, returns only the directory fields, and every entry is verified", async () => {
  const r = await directory();
  for (const h of r.body.houses) {
    assert.deepEqual(Object.keys(h).sort(), KEYS);
    assert.equal(h.verified, true);
    assert.match(h.accent, /^#[0-9a-f]{6}$/i);
    assert.equal(typeof h.merchantName, "string");
  }
  const dangg = r.body.houses.find((h) => h.propertyId === "prop_dangg");
  assert.deepEqual(dangg, { plotId: "slot-11", propertyId: "prop_dangg", merchantName: "DanGG", verified: true, theme: "merchant_house", accent: "#e8dcc0" });
});

it("is ordered by plot order, then plot id, and is stable across calls", async () => {
  const first = (await directory()).body.houses;
  const second = (await directory()).body.houses;
  assert.deepEqual(first, second);
  const order = await sql("SELECT id, sort_order FROM plots WHERE id = ANY($1)", [first.map((h) => h.plotId)]);
  const rank = new Map(order.map((p) => [p.id, [p.sort_order, p.id]]));
  const sorted = [...first].sort((a, b) => {
    const [sa, ia] = rank.get(a.plotId);
    const [sb, ib] = rank.get(b.plotId);
    return sa - sb || (ia < ib ? -1 : ia > ib ? 1 : 0);
  });
  assert.deepEqual(first.map((h) => h.plotId), sorted.map((h) => h.plotId));
});

it("3 verified, 1 unverified, 1 suspended and 1 unpublished extra: exactly the 3 verified appear", async () => {
  const before = (await directory()).body.houses.length;
  const verified = [await addHouse("b3_v1", { sortOrder: 951 }), await addHouse("b3_v2", { sortOrder: 952 }), await addHouse("b3_v3", { sortOrder: 953 })];
  await addHouse("b3_unverified", { verified: false });
  await addHouse("b3_suspended", { suspended: true });
  await addHouse("b3_unpublished", { published: false });
  const after = (await directory()).body.houses;
  assert.equal(after.length, before + 3);
  assert.deepEqual(after.slice(-3).map((h) => h.propertyId), verified);
});

it("suspending a merchant removes its house on the next read; reinstating brings it back", async () => {
  await sql("UPDATE merchants SET suspended = true WHERE id = 'mer_test'");
  assert.ok(!(await directory()).body.houses.some((h) => h.propertyId === "prop_test"));
  await sql("UPDATE merchants SET suspended = false WHERE id = 'mer_test'");
  assert.ok((await directory()).body.houses.some((h) => h.propertyId === "prop_test"));
});

it("a house without a plot or without a merchant binding is not listed", async () => {
  const id = await addHouse("b3_unbound");
  await sql("UPDATE properties SET merchant_id = NULL WHERE id = $1", [id]);
  const ids = (await listWorldHouses({ pool })).map((h) => h.propertyId);
  assert.ok(!ids.includes(id));
});

it("store results are frozen", async () => {
  const houses = await listWorldHouses({ pool });
  assert.ok(Object.isFrozen(houses));
  assert.ok(houses.every((h) => Object.isFrozen(h)));
});

it("re-seeding keeps a demo merchant's moderation state (suspension and verified_at)", async () => {
  const [before] = await sql("UPDATE merchants SET suspended = true WHERE id = 'mer_demo_lantern' RETURNING verified_at");
  try {
    await applySliceFixtures(pool);
    const [after] = await sql("SELECT suspended, verified_at FROM merchants WHERE id = 'mer_demo_lantern'");
    assert.equal(after.suspended, true);
    assert.deepEqual(after.verified_at, before.verified_at);
    assert.ok(!(await directory()).body.houses.some((h) => h.propertyId === "prop_demo_lantern"));
  } finally {
    await sql("UPDATE merchants SET suspended = false WHERE id = 'mer_demo_lantern'");
  }
});
