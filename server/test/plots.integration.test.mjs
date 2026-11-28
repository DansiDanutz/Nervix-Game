/**
 * B1: the plot registry and house binding, on a throwaway Postgres database
 * with migrations 001-017 and the slice fixtures. The database itself rejects
 * double-booked plots, a second house per merchant and cross-owner bindings;
 * allocation is transactional (FOR UPDATE SKIP LOCKED).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { applySliceFixtures } from "../seed/slice-fixtures.mjs";
import { PostgresStore } from "../src/store.mjs";
import { allocateHouse, listPlots } from "../src/store/plots.mjs";
import { ProvisioningError } from "../src/provision.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";

const available = pgAvailable();
const CONCURRENT = 10;
const SLOT_IDS = [
  "slot-01", "slot-02", "slot-03", "slot-04", "slot-05", "slot-06", "slot-07", "slot-08",
  "cafe-1", "cafe-2", "cafe-3", "cafe-4", "venue-1", "venue-2",
];

let db;
let store;
const sql = async (text, values) => (await store.pool.query(text, values)).rows;

async function addMerchantUser(id, verified = true) {
  await sql(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
             VALUES ($1, $2, $1, 'player', true, true)`, [`usr_${id}`, `${id}@fixture.nervix.invalid`]);
  await sql(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at)
             VALUES ($1, $2, 'merchant', $1, CASE WHEN $3 THEN now() END)`, [`mer_${id}`, `usr_${id}`, verified]);
  return { userId: `usr_${id}`, merchantId: `mer_${id}` };
}

/** Postgres error code of a rejected statement. */
async function rejection(text, values) {
  try {
    await sql(text, values);
  } catch (error) {
    return error.code;
  }
  return null;
}

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_b1" });
  store = new PostgresStore(db.url);
  await applySliceFixtures(store.pool);
});

test.after(async () => {
  await store?.close();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it("migration 017 seeds the plots with the former slot ids, in the former order", async () => {
  const seeded = (await listPlots(store)).map((p) => p.id).filter((id) => SLOT_IDS.includes(id));
  assert.deepEqual(seeded, SLOT_IDS);
  const venue = (await listPlots(store)).find((p) => p.id === "venue-1");
  assert.deepEqual({ ...venue }, { id: "venue-1", district: "entertainment-district", template: "casino_venue" });
});

it("fixture houses sit on real plots: plot_id equals slot_id", async () => {
  const rows = await sql("SELECT id, plot_id, slot_id FROM properties WHERE id IN ('prop_dangg','prop_test','prop_unverified') ORDER BY id");
  assert.deepEqual(rows, [
    { id: "prop_dangg", plot_id: "slot-11", slot_id: "slot-11" },
    { id: "prop_test", plot_id: "slot-12", slot_id: "slot-12" },
    { id: "prop_unverified", plot_id: "slot-13", slot_id: "slot-13" },
  ]);
});

it("the database rejects a second house on one plot", async () => {
  const a = await addMerchantUser("b1_plot_a");
  const code = await rejection(
    `INSERT INTO properties (id, owner_id, merchant_id, plot_id, slot_id, district, template, address)
     VALUES ('prop_b1_plot_a', $1, $2, 'slot-11', 'b1-dup-slot', 'merchant-quarter', 'merchant_house', 'x')`, [a.userId, a.merchantId]);
  assert.equal(code, "23505");
});

it("the database rejects a second house bound to one merchant, but allows unbound houses", async () => {
  const owner = await addMerchantUser("b1_twice");
  const code = await rejection(
    `INSERT INTO properties (id, owner_id, merchant_id, slot_id, district, template, address)
     VALUES ('prop_b1_twice', 'usr_dangg', 'mer_dangg', 'b1-twice', 'merchant-quarter', 'merchant_house', 'x')`);
  assert.ok(["23505", "23503"].includes(code), String(code));
  await sql(`INSERT INTO properties (id, owner_id, slot_id, district, template, address)
             VALUES ('prop_b1_unbound', $1, 'b1-unbound', 'merchant-quarter', 'merchant_house', 'x')`, [owner.userId]);
});

it("the database rejects a house whose owner is not the merchant's owner", async () => {
  const other = await addMerchantUser("b1_cross");
  const houseless = await addMerchantUser("b1_cross_target");
  const code = await rejection(
    `INSERT INTO properties (id, owner_id, merchant_id, slot_id, district, template, address)
     VALUES ('prop_b1_cross', $1, $2, 'b1-cross', 'merchant-quarter', 'merchant_house', 'x')`, [other.userId, houseless.merchantId]);
  assert.equal(code, "23503");
  assert.equal(await rejection("UPDATE properties SET merchant_id = $1 WHERE id = 'prop_dangg'", [houseless.merchantId]), "23503");
});

it("the database rejects a catalogue bound to another owner's merchant, or a second one per merchant", async () => {
  const other = await addMerchantUser("b1_bld");
  const target = await addMerchantUser("b1_bld_target");
  assert.equal(await rejection("INSERT INTO builders (id, owner_id, name, merchant_id) VALUES ('bld_b1_cross', $1, 'x', $2)", [other.userId, target.merchantId]), "23503");
  assert.equal(await rejection("INSERT INTO builders (id, owner_id, name, merchant_id) VALUES ('bld_b1_dup', 'usr_dangg', 'x', 'mer_dangg')"), "23505");
});

it("getHouse returns the catalogue bound to the house's merchant, even when the owner has several", async () => {
  await sql("INSERT INTO builders (id, owner_id, name) VALUES ('bld_a_dangg_extra', 'usr_dangg', 'Extra')");
  await sql("INSERT INTO builder_offerings (id, builder_id, name, price_minor, currency) VALUES ('off_b1_extra', 'bld_a_dangg_extra', 'Extra', 1, 'EUR')");
  for (let i = 0; i < 3; i++) {
    const house = await store.getHouse("prop_dangg");
    assert.equal(house.builderId, "bld_dangg");
    assert.ok(!house.listings.some((l) => l.id === "off_b1_extra"));
  }
});

it("a house with no merchant binding shows no catalogue, even when its owner has one (fail closed)", async () => {
  const owner = await addMerchantUser("b1_nomer");
  await sql(`INSERT INTO properties (id, owner_id, slot_id, district, template, address, published)
             VALUES ('prop_b1_nomer', $1, 'b1-nomer', 'merchant-quarter', 'merchant_house', 'x', true)`, [owner.userId]);
  await sql("INSERT INTO builders (id, owner_id, name, merchant_id) VALUES ('bld_b1_nomer', $1, 'Own', $2)", [owner.userId, owner.merchantId]);
  await sql("INSERT INTO builder_offerings (id, builder_id, name, price_minor, currency) VALUES ('off_b1_nomer', 'bld_b1_nomer', 'Own', 1, 'EUR')");
  const house = await store.getHouse("prop_b1_nomer");
  assert.equal(house.merchantId, null);
  assert.equal(house.builderId, null);
  assert.deepEqual(house.listings, []);
});

it(`${CONCURRENT} concurrent allocations never assign one plot twice`, async () => {
  const callers = await Promise.all(Array.from({ length: CONCURRENT }, (_, i) => addMerchantUser(`b1_race_${i}`)));
  const results = await Promise.all(callers.map((c) => allocateHouse(store, { ...c, businessType: "merchant" })));
  assert.ok(results.every((r) => r.created));
  const plots = results.map((r) => r.property.plotId);
  assert.equal(new Set(plots).size, CONCURRENT);
  const stored = await sql("SELECT plot_id, merchant_id FROM properties WHERE owner_id = ANY($1)", [callers.map((c) => c.userId)]);
  assert.equal(stored.length, CONCURRENT);
  assert.equal(new Set(stored.map((r) => r.plot_id)).size, CONCURRENT);
  for (const row of stored) assert.ok(callers.some((c) => c.merchantId === row.merchant_id));
});

it("concurrent allocations for one caller create exactly one house", async () => {
  const one = await addMerchantUser("b1_same");
  const results = await Promise.all(Array.from({ length: 5 }, () => allocateHouse(store, { ...one, businessType: "merchant" })));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(new Set(results.map((r) => r.property.id)).size, 1);
  assert.equal((await sql("SELECT count(*)::int AS n FROM properties WHERE owner_id = $1", [one.userId]))[0].n, 1);
});

it("an existing house is returned with its stored merchant binding", async () => {
  const again = await allocateHouse(store, { userId: "usr_dangg", merchantId: "mer_dangg", businessType: "merchant" });
  assert.equal(again.created, false);
  assert.equal(again.property.id, "prop_dangg");
  assert.equal(again.property.merchantId, "mer_dangg");
  assert.equal(again.property.slotId, "slot-11");
});

it("an ordinary player gets no house, and exhausted plots raise instead of overbooking", async () => {
  assert.deepEqual(await allocateHouse(store, { userId: "usr_visitor", merchantId: null, businessType: "user" }), { property: null, created: false });
  await assert.rejects(allocateHouse(store, { userId: "usr_visitor", businessType: "nope" }), ProvisioningError);
  const fill = [];
  for (let i = 0; i < SLOT_IDS.length; i++) fill.push(await addMerchantUser(`b1_fill_${i}`));
  const outcomes = await Promise.allSettled(fill.map((c) => allocateHouse(store, { ...c, businessType: "cafe" })));
  const rejected = outcomes.filter((o) => o.status === "rejected");
  assert.ok(rejected.length > 0);
  assert.ok(rejected.every((o) => o.reason instanceof ProvisioningError), String(rejected[0]?.reason));
  const free = await sql("SELECT count(*)::int AS n FROM plots pl WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.plot_id = pl.id)");
  assert.equal(free[0].n, 0);
});
