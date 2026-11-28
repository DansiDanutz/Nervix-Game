/**
 * B1 over HTTP: provisioning allocates plots in the database (no in-memory
 * race), unpublished catalogues are hidden from everyone but the house's
 * editor, and a stored merchant binding that is not the authorised merchant
 * is denied. Throwaway database with the slice fixtures plus B1-only rows.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 7;
const CONCURRENT = 10;
const available = pgAvailable();
const RACERS = Array.from({ length: CONCURRENT }, (_, i) => `b1r_${i}`);
const EXTRA = Object.freeze(["b1r_same", "b1r_draft", "b1r_legacy", "b1r_vis", "b1r_split", ...RACERS]);
const session = (key) => SESSIONS[key] ?? `sess_${key}`;

let db;
let pool;
let server;
const sql = async (text, values) => (await pool.query(text, values)).rows;

async function seedExtras() {
  for (const key of EXTRA) {
    await sql(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
               VALUES ($1, $2, $1, 'player', true, true)`, [`usr_${key}`, `${key}@fixture.nervix.invalid`]);
    await sql("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [`sess_${key}`, `usr_${key}`]);
    await sql(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at) VALUES ($1, $2, 'merchant', $1, now())`,
      [`mer_${key}`, `usr_${key}`]);
  }
}

async function call(method, path, key, body) {
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${session(key)}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_b1r" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  await seedExtras();
  const subscribers = [...SUBSCRIBERS, ...EXTRA.map((k) => `usr_${k}`)];
  server = await startServer({ port: await pickTestPort(PORT_SLOT), env: { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: subscribers.join(",") } });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it(`${CONCURRENT} concurrent POST /businesses all succeed on distinct plots`, async () => {
  const results = await Promise.all(RACERS.map((key) => call("POST", "/businesses", key, {})));
  assert.deepEqual(results.map((r) => r.status), RACERS.map(() => 200));
  assert.ok(results.every((r) => r.body.created === true));
  assert.equal(new Set(results.map((r) => r.body.property.slotId)).size, CONCURRENT);
  RACERS.forEach((key, i) => assert.equal(results[i].body.property.merchantId, `mer_${key}`));
  const rows = await sql("SELECT plot_id FROM properties WHERE owner_id = ANY($1)", [RACERS.map((k) => `usr_${k}`)]);
  assert.equal(new Set(rows.map((r) => r.plot_id)).size, CONCURRENT);
});

it("concurrent provisions by one caller never 500 and create one house", async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => call("POST", "/merchants/provision", "b1r_same", {})));
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200]);
  assert.equal(results.filter((r) => r.body.created).length, 1);
  assert.equal(new Set(results.map((r) => r.body.property.id)).size, 1);
});

it("an unpublished house's catalogue is not_found except for its editor", async () => {
  const made = await call("POST", "/businesses", "b1r_draft", {});
  assert.equal(made.status, 200);
  assert.equal(made.body.property.published, false);
  const id = made.body.property.id;
  const product = await call("POST", `/businesses/${id}/products`, "b1r_draft", { sku: "draft-1", name: "Draft", unitAmountMinor: 1, currency: "EUR", fulfillment: "digital" });
  assert.equal(product.status, 200);
  const anon = await call("GET", `/businesses/${id}/catalog`, null);
  assert.equal(anon.status, 403);
  assert.equal(anon.body.items, undefined);
  for (const who of ["visitor", "dangg", "sub", "unverified"]) {
    const res = await call("GET", `/businesses/${id}/catalog`, who);
    assert.equal(res.body.error, "not_found", String(who));
    assert.equal(res.body.items, undefined, String(who));
  }
  const own = await call("GET", `/businesses/${id}/catalog`, "b1r_draft");
  assert.equal(own.status, 200);
  assert.ok(own.body.items.some((i) => i.sku === "draft-1"));
  const published = await call("GET", "/businesses/prop_dangg/catalog", "visitor");
  assert.ok(Array.isArray(published.body.items));
});

it("a stored binding to a merchant other than the authorised one is denied as cross_owner", async () => {
  // Simulate a legacy row that predates 017's owner check: bound to another user's merchant.
  await sql("ALTER TABLE properties DROP CONSTRAINT properties_merchant_owner_fkey");
  try {
    await sql("UPDATE properties SET merchant_id = NULL WHERE id = 'prop_unverified'");
    await sql(`INSERT INTO properties (id, owner_id, merchant_id, slot_id, plot_id, district, template, address, published)
               VALUES ('prop_b1r_legacy', 'usr_b1r_legacy', 'mer_unverified', 'b1-legacy', NULL, 'merchant-quarter', 'merchant_house', 'x', false)`);
    const res = await call("POST", "/businesses", "b1r_legacy", {});
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "cross_owner");
  } finally {
    await sql("DELETE FROM properties WHERE id = 'prop_b1r_legacy'");
    await sql("UPDATE properties SET merchant_id = 'mer_unverified' WHERE id = 'prop_unverified'");
    await sql(`ALTER TABLE properties ADD CONSTRAINT properties_merchant_owner_fkey
               FOREIGN KEY (merchant_id, owner_id) REFERENCES merchants (id, owner_id)`);
  }
});

const builderIds = (res) => res.body.builders.map((b) => b.id);

it("GET /builders hides catalogues of unpublished or unbound houses, except from their owner", async () => {
  const house = await call("POST", "/businesses", "b1r_vis", {});
  assert.equal(house.body.property.published, false);
  const made = await call("POST", "/builders", "b1r_vis", { name: "Draft Studio" });
  assert.equal(made.status, 200);
  const id = made.body.builder.id;
  assert.equal((await call("POST", `/builders/${id}/offerings`, "b1r_vis", { name: "Draft seat", priceMinor: 1, currency: "EUR" })).status, 200);
  await sql("INSERT INTO builders (id, owner_id, name) VALUES ('bld_b1r_unbound', 'usr_dangg', 'Unbound')");
  for (const who of ["visitor", "dangg", "sub"]) {
    const res = await call("GET", "/builders", who);
    assert.equal(res.status, 200, String(who));
    assert.ok(!builderIds(res).includes(id), `draft catalogue leaked to ${who}`);
    assert.ok(builderIds(res).includes("bld_dangg"), String(who));
  }
  assert.ok(!builderIds(await call("GET", "/builders", "visitor")).includes("bld_b1r_unbound"));
  assert.ok(builderIds(await call("GET", "/builders", "dangg")).includes("bld_b1r_unbound"));
  const own = await call("GET", "/builders", "b1r_vis");
  assert.ok(own.body.builders.find((b) => b.id === id).offerings.some((o) => o.name === "Draft seat"));
});

it("a new catalogue binds only to the caller's house merchant, never to another verified one", async () => {
  await sql(`INSERT INTO merchants (id, owner_id, business_type, name) VALUES ('mer_b1r_split_house', 'usr_b1r_split', 'merchant', 'Unverified')`);
  await sql("INSERT INTO plots (id, district, template, sort_order) VALUES ('b1r-split', 'merchant-quarter', 'merchant_house', 950)");
  await sql(`INSERT INTO properties (id, owner_id, merchant_id, plot_id, slot_id, district, template, address, published)
             VALUES ('prop_b1r_split', 'usr_b1r_split', 'mer_b1r_split_house', 'b1r-split', 'b1r-split', 'merchant-quarter', 'merchant_house', 'x', true)`);
  const res = await call("POST", "/builders", "b1r_split", { name: "Split" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "unverified_merchant");
  const bound = await sql("SELECT merchant_id FROM builders WHERE owner_id = 'usr_b1r_split'");
  assert.ok(bound.every((r) => r.merchant_id !== "mer_b1r_split"), JSON.stringify(bound));
  await sql("UPDATE merchants SET verified_at = now() WHERE id = 'mer_b1r_split_house'");
  const after = await call("POST", "/builders", "b1r_split", { name: "Split" });
  assert.equal(after.status, 200);
  assert.deepEqual(await sql("SELECT merchant_id FROM builders WHERE owner_id = 'usr_b1r_split'"), [{ merchant_id: "mer_b1r_split_house" }]);
});
