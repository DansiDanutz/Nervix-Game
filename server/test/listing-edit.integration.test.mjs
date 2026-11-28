/**
 * P4 over HTTP on a throwaway database with the slice fixtures: the owner
 * adds a categorised listing with a display slot, edits its category, slot,
 * sort order and name, and deactivates it. Every one of those edits made by a
 * cross owner, a subscriber without a merchant, a visitor or an anonymous
 * caller is refused (401/403) and changes nothing. A new listing shows only
 * in its own house.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 16;
const available = pgAvailable();
let db;
let pool;
let server;

async function call(method, path, key, body) {
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${SESSIONS[key]}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const listing = async (key, prop, id) => (await call("GET", `/houses/${prop}`, key)).body.house.listings.find((l) => l.id === id);
const row = async (id) => (await pool.query("SELECT name, category, display_slot, sort_order, active FROM builder_offerings WHERE id = $1", [id])).rows[0];

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_p4" });
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

const EDITS = Object.freeze([
  { category: "drink" },
  { slot: 3 },
  { category: null, slot: null },
  { sortOrder: -5 },
  { name: "Hijacked" },
  { active: false },
]);

it("the owner adds a categorised listing on a slot; it shows only in their own house", async () => {
  const add = await call("POST", "/houses/prop_test/listings", "test", { name: "P4 Iced Tea", priceMinor: 320, currency: "EUR", category: "drink", slot: 4 });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  const id = add.body.offering.id;
  const own = await listing("visitor", "prop_test", id);
  assert.equal(own.category, "drink");
  assert.equal(own.slot, 4);
  assert.equal(await listing("visitor", "prop_dangg", id), undefined);
});

it("the owner edits category, slot, sort order and name, then deactivates", async () => {
  const id = "off_test_1";
  for (const patch of [{ category: "merch", slot: 2 }, { sortOrder: 7, name: "Renamed Widget" }]) {
    const r = await call("PATCH", `/houses/prop_test/listings/${id}`, "test", patch);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.deepEqual(await row(id), { name: "Renamed Widget", category: "merch", display_slot: 2, sort_order: 7, active: true });
  const off = await call("PATCH", `/houses/prop_test/listings/${id}`, "test", { active: false });
  assert.equal(off.status, 200);
  assert.equal(await listing("visitor", "prop_test", id), undefined, "visitors no longer see it");
  assert.equal((await listing("test", "prop_test", id)).active, false, "the owner still sees it, flagged");
  await call("PATCH", `/houses/prop_test/listings/${id}`, "test", { active: true });
});

it("cross-owner, subscription-only, visitor and anonymous listing edits are refused and change nothing", async () => {
  const before = await row("off_dangg_1");
  const callers = [["dangg", "prop_test", "off_dangg_1"], ["dangg", "prop_dangg", "off_test_1"], ["sub", "prop_dangg", "off_dangg_1"], ["visitor", "prop_dangg", "off_dangg_1"]];
  for (const [key, prop, id] of callers) {
    for (const patch of EDITS) {
      const r = await call("PATCH", `/houses/${prop}/listings/${id}`, key, patch);
      assert.equal(r.status, 403, `${key} ${prop}/${id} ${JSON.stringify(patch)} → ${r.status}`);
    }
  }
  const anon = await call("PATCH", "/houses/prop_dangg/listings/off_dangg_1", null, { active: false });
  assert.equal(anon.status, 401);
  assert.deepEqual(await row("off_dangg_1"), before);
});

it("subscription-only and cross-owner callers cannot add listings to a house", async () => {
  const sub = await call("POST", "/houses/prop_dangg/listings", "sub", { name: "Sub item", priceMinor: 1, category: "drink" });
  assert.equal(sub.status, 403);
  assert.equal(sub.body.error, "not_merchant");
  const cross = await call("POST", "/houses/prop_test/listings", "dangg", { name: "Cross item", priceMinor: 1, category: "drink" });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.error, "cross_owner");
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM builder_offerings WHERE name IN ('Sub item', 'Cross item')");
  assert.equal(rows[0].n, 0);
});

// Owner input refusals are client errors: HTTP 400 with the code in `error`,
// so any caller (not only the listingEdit wrapper) sees them as failures.
it("invalid category, slot or active flag from the owner is a 400 with its code and changes nothing", async () => {
  const before = await row("off_test_1");
  const cases = [[{ category: "weapon" }, "invalid_category"], [{ slot: 32 }, "invalid_slot"], [{ slot: 1.5 }, "invalid_slot"], [{ active: "no" }, "invalid_active"], [{ priceMinor: -1 }, "invalid_price"]];
  for (const [patch, code] of cases) {
    const r = await call("PATCH", "/houses/prop_test/listings/off_test_1", "test", patch);
    assert.equal(r.status, 400, `${JSON.stringify(patch)} → ${r.status}`);
    assert.equal(r.body.error, code, `${JSON.stringify(patch)} → ${JSON.stringify(r.body)}`);
    assert.equal(r.body.offering, undefined);
  }
  assert.deepEqual(await row("off_test_1"), before);
});

it("invalid new listings from the owner are a 400 with their code and add nothing", async () => {
  const cases = [
    [{ name: "Bad cat", priceMinor: 1, category: "weapon" }, "invalid_category"],
    [{ name: "Bad slot", priceMinor: 1, slot: 999 }, "invalid_slot"],
    [{ name: "", priceMinor: 1 }, "name_required"],
    [{ name: "Bad price", priceMinor: -5 }, "invalid_price"],
  ];
  for (const [body, code] of cases) {
    const r = await call("POST", "/houses/prop_test/listings", "test", body);
    assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    assert.equal(r.body.error, code);
    assert.equal(r.body.offering, undefined);
  }
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM builder_offerings WHERE name IN ('Bad cat', 'Bad slot', 'Bad price')");
  assert.equal(rows[0].n, 0);
});
