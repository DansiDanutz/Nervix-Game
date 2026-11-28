/**
 * P1 over HTTP on a throwaway database with the slice fixtures: listing
 * display fields, visitor filtering of inactive listings, owner-only
 * deactivate, featured ids bound to the house, slot collisions, unpublished
 * houses, and the welcome:null fix. The database CHECKs are tested directly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 8;
const available = pgAvailable();
let db;
let pool;
let server;
const sql = async (text, values) => (await pool.query(text, values)).rows;

async function call(method, path, key, body) {
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${SESSIONS[key]}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const houseOf = async (key, prop = "prop_dangg") => (await call("GET", `/houses/${prop}`, key)).body;
const ids = (house) => house.house.listings.map((l) => l.id);

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_p1" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  server = await startServer({ port: await pickTestPort(PORT_SLOT), env: { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(",") } });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it("the database rejects an unknown category, an out-of-range slot or sort order", async () => {
  const insert = (col, value) => pool.query(
    `INSERT INTO builder_offerings (id, builder_id, name, price_minor, currency, ${col}) VALUES ($1, 'bld_dangg', 'x', 1, 'EUR', $2)`,
    [`off_chk_${col}`, value]);
  await assert.rejects(insert("category", "weapon"), /check/i);
  await assert.rejects(insert("display_slot", 999), /check/i);
  await assert.rejects(insert("sort_order", 10_000_000), /check/i);
});

it("getHouse returns description, category, slot, sort order and active per listing", async () => {
  const house = await houseOf("visitor");
  const seat = house.house.listings.find((l) => l.id === "off_dangg_1");
  assert.deepEqual(Object.keys(seat).sort(), ["active", "category", "currency", "description", "id", "name", "priceMinor", "slot", "sortOrder"]);
  assert.equal(seat.category, "seat");
  assert.equal(seat.active, true);
  assert.equal(typeof seat.description, "string");
});

it("an invalid category or slot is rejected on add and on edit", async () => {
  const add = await call("POST", "/houses/prop_dangg/listings", "dangg", { name: "Bad", priceMinor: 1, category: "weapon" });
  assert.equal(add.body.error, "invalid_category");
  const slot = await call("POST", "/houses/prop_dangg/listings", "dangg", { name: "Bad", priceMinor: 1, slot: 999 });
  assert.equal(slot.body.error, "invalid_slot");
  const edit = await call("PATCH", "/houses/prop_dangg/listings/off_dangg_1", "dangg", { category: "nope" });
  assert.equal(edit.body.error, "invalid_category");
  const rows = await sql("SELECT category FROM builder_offerings WHERE id = 'off_dangg_1'");
  assert.equal(rows[0].category, "seat");
});

it("the owner adds a listing with display fields and can clear its category", async () => {
  const add = await call("POST", "/houses/prop_test/listings", "test", { name: "Shelf Item", priceMinor: 300, category: "merch", slot: 4, sortOrder: 2 });
  assert.equal(add.status, 200);
  const id = add.body.offering.id;
  const shown = (await houseOf("visitor", "prop_test")).house.listings.find((l) => l.id === id);
  assert.deepEqual([shown.category, shown.slot, shown.sortOrder, shown.active], ["merch", 4, 2, true]);
  const cleared = await call("PATCH", `/houses/prop_test/listings/${id}`, "test", { category: null, slot: null });
  assert.equal(cleared.status, 200);
  const after = (await houseOf("visitor", "prop_test")).house.listings.find((l) => l.id === id);
  assert.deepEqual([after.category, after.slot, after.name], [null, null, "Shelf Item"]);
});

it("cross-owner and subscription-only deactivation is denied and changes nothing", async () => {
  const cross = await call("PATCH", "/houses/prop_test/listings/off_test_1", "dangg", { active: false });
  assert.equal(cross.status, 403);
  const foreign = await call("PATCH", "/houses/prop_dangg/listings/off_test_1", "dangg", { active: false });
  assert.equal(foreign.status, 403);
  const sub = await call("PATCH", "/houses/prop_dangg/listings/off_dangg_2", "sub", { active: false });
  assert.equal(sub.status, 403);
  const visitor = await call("PATCH", "/houses/prop_dangg/listings/off_dangg_2", "visitor", { active: false });
  assert.equal(visitor.status, 403);
  const rows = await sql("SELECT id, active FROM builder_offerings WHERE id IN ('off_test_1', 'off_dangg_2') ORDER BY id");
  assert.deepEqual(rows.map((r) => r.active), [true, true]);
});

it("a deactivated listing is hidden from visitors everywhere but stays visible to its owner", async () => {
  const off = await call("PATCH", "/houses/prop_dangg/listings/off_dangg_2", "dangg", { active: false });
  assert.equal(off.status, 200);
  try {
    assert.ok(!ids(await houseOf("visitor")).includes("off_dangg_2"));
    assert.ok(!ids(await houseOf("test")).includes("off_dangg_2"));
    const owner = await houseOf("dangg");
    assert.equal(owner.house.listings.find((l) => l.id === "off_dangg_2").active, false);
    const deep = await call("GET", "/houses/prop_dangg?listing=off_dangg_2", "visitor");
    assert.equal(deep.body.error, "listing_mismatch");
    const builders = (await call("GET", "/builders", "visitor")).body.builders;
    const offerings = builders.find((b) => b.id === "bld_dangg").offerings.map((o) => o.id);
    assert.ok(!offerings.includes("off_dangg_2"));
  } finally {
    await call("PATCH", "/houses/prop_dangg/listings/off_dangg_2", "dangg", { active: true });
  }
  assert.ok(ids(await houseOf("visitor")).includes("off_dangg_2"));
});

it("a foreign featured id is rejected, the house's own ids are kept", async () => {
  const foreign = await call("PATCH", "/houses/prop_dangg/profile", "dangg", { display: { featuredListingIds: ["off_dangg_1", "off_test_1"] } });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.body.error, "invalid_profile");
  const unknown = await call("PATCH", "/houses/prop_dangg/profile", "dangg", { display: { featuredListingIds: ["off_made_up"] } });
  assert.equal(unknown.status, 400);
  const own = await call("PATCH", "/houses/prop_dangg/profile", "dangg", { display: { featuredListingIds: ["off_dangg_2"] } });
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.profile.display.featuredListingIds, ["off_dangg_2"]);
});

it("visitors never see an inactive listing among the featured ids", async () => {
  await call("PATCH", "/houses/prop_dangg/profile", "dangg", { display: { featuredListingIds: ["off_dangg_1", "off_dangg_2"] } });
  await call("PATCH", "/houses/prop_dangg/listings/off_dangg_1", "dangg", { active: false });
  try {
    assert.deepEqual((await houseOf("visitor")).house.profile.display.featuredListingIds, ["off_dangg_2"]);
    assert.deepEqual((await houseOf("dangg")).house.profile.display.featuredListingIds, ["off_dangg_1", "off_dangg_2"]);
  } finally {
    await call("PATCH", "/houses/prop_dangg/listings/off_dangg_1", "dangg", { active: true });
  }
});

it("a slot collision resolves deterministically in the house response", async () => {
  const a = await call("POST", "/houses/prop_test/listings", "test", { name: "Zeta", priceMinor: 1, slot: 7, sortOrder: 0 });
  const b = await call("POST", "/houses/prop_test/listings", "test", { name: "Alpha", priceMinor: 1, slot: 7, sortOrder: 0 });
  const first = (await houseOf("visitor", "prop_test")).house.listings;
  const second = (await houseOf("visitor", "prop_test")).house.listings;
  assert.deepEqual(first, second);
  const slotted = first.filter((l) => l.slot === 7);
  assert.deepEqual(slotted.map((l) => l.id), [b.body.offering.id]);
  assert.equal(first.find((l) => l.id === a.body.offering.id).slot, null);
  assert.equal(first[0].id, b.body.offering.id);
});

it("a cleared welcome is stored and returned as null, not \"null\"", async () => {
  await call("PATCH", "/houses/prop_dangg/profile", "dangg", { welcome: "Hello" });
  const cleared = await call("PATCH", "/houses/prop_dangg/profile", "dangg", { welcome: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.profile.welcome, null);
  const rows = await sql("SELECT welcome FROM house_profiles WHERE property_id = 'prop_dangg'");
  assert.equal(rows[0].welcome, null);
});

it("an unpublished house is unknown to visitors but readable by its owner", async () => {
  await sql("UPDATE properties SET published = false WHERE id = 'prop_test'");
  try {
    assert.equal((await houseOf("visitor", "prop_test")).error, "unknown_house");
    assert.equal((await houseOf("dangg", "prop_test")).error, "unknown_house");
    const owner = await houseOf("test", "prop_test");
    assert.equal(owner.canEdit, true);
    assert.equal(owner.house.propertyId, "prop_test");
  } finally {
    await sql("UPDATE properties SET published = true WHERE id = 'prop_test'");
  }
});

it("migration 018 turns a welcome stored as the string \"null\" back into NULL", async () => {
  const { readFileSync } = await import("node:fs");
  await sql(`INSERT INTO house_profiles (property_id, welcome) VALUES ('prop_unverified', 'null')
             ON CONFLICT (property_id) DO UPDATE SET welcome = 'null'`);
  await pool.query(readFileSync(new URL("../db/migrations/018_listing_display.sql", import.meta.url), "utf8"));
  const rows = await sql("SELECT welcome FROM house_profiles WHERE property_id = 'prop_unverified'");
  assert.equal(rows[0].welcome, null);
});

it("mixed-case names come out in the same case-folded order from the house and from /builders", async () => {
  const banana = (await call("POST", "/houses/prop_test/listings", "test", { name: "Banana", priceMinor: 1 })).body.offering.id;
  const apple = (await call("POST", "/houses/prop_test/listings", "test", { name: "apple", priceMinor: 1 })).body.offering.id;
  const pair = (list) => list.filter((id) => id === banana || id === apple);
  assert.deepEqual(pair(ids(await houseOf("visitor", "prop_test"))), [apple, banana]);
  const builders = (await call("GET", "/builders", "visitor")).body.builders;
  assert.deepEqual(pair(builders.find((b) => b.id === "bld_test").offerings.map((o) => o.id)), [apple, banana]);
});

it("description:null clears the description instead of storing \"null\"", async () => {
  const made = (await call("POST", "/houses/prop_test/listings", "test", { name: "Described", priceMinor: 1, description: "Words" })).body.offering.id;
  const cleared = await call("PATCH", `/houses/prop_test/listings/${made}`, "test", { description: null });
  assert.equal(cleared.status, 200);
  const rows = await sql("SELECT description FROM builder_offerings WHERE id = $1", [made]);
  assert.equal(rows[0].description, null);
});

it("a stale foreign featured id stored before P1 is hidden from the editor too", async () => {
  await sql(`UPDATE house_profiles SET display = '{"featuredListingIds": ["off_dangg_1", "off_test_1"]}'::jsonb WHERE property_id = 'prop_dangg'`);
  assert.deepEqual((await houseOf("dangg")).house.profile.display.featuredListingIds, ["off_dangg_1"]);
  assert.deepEqual((await houseOf("visitor")).house.profile.display.featuredListingIds, ["off_dangg_1"]);
});

it("cross-owner and subscription-only {active:false} through the builders route is 403 and changes nothing", async () => {
  const cross = await call("PATCH", "/builders/bld_test/offerings/off_test_1", "dangg", { active: false });
  assert.equal(cross.status, 403);
  const sub = await call("PATCH", "/builders/bld_dangg/offerings/off_dangg_2", "sub", { active: false });
  assert.equal(sub.status, 403);
  const foreign = await call("PATCH", "/builders/bld_dangg/offerings/off_test_1", "dangg", { active: false });
  assert.equal(foreign.status, 403);
  const rows = await sql("SELECT active FROM builder_offerings WHERE id IN ('off_test_1', 'off_dangg_2') ORDER BY id");
  assert.deepEqual(rows.map((r) => r.active), [true, true]);
});

it("re-seeding keeps a category the owner changed and fills only a missing one", async () => {
  await call("PATCH", "/houses/prop_dangg/listings/off_dangg_1", "dangg", { category: "food" });
  await call("PATCH", "/houses/prop_dangg/listings/off_dangg_2", "dangg", { category: null });
  try {
    await applySliceFixtures(pool);
    const rows = await sql("SELECT id, category FROM builder_offerings WHERE id IN ('off_dangg_1', 'off_dangg_2') ORDER BY id");
    assert.deepEqual(rows.map((r) => r.category), ["food", "bundle"]);
  } finally {
    await sql("UPDATE builder_offerings SET category = 'seat' WHERE id = 'off_dangg_1'");
  }
});
