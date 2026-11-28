/**
 * P5 against the real server on a throwaway Postgres database with the slice
 * fixtures: the merchant agent's catalogue is that house's visible
 * builder_offerings, never the legacy `products` table and never another
 * merchant's listings, and agent checkouts are priced from builder_offerings
 * on the server.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { PostgresStore } from "../src/store.mjs";
import { agentCatalogue, LISTING_FULFILLMENT } from "../src/house-catalogue.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 11;
const LEGACY_SKU = "legacy_salon_kit";
const HIDDEN_ID = "off_p5_hidden";
const FOREIGN_ID = "off_test_1";

const available = pgAvailable();
let db;
let store;
let server;
const sql = async (text, values) => (await store.pool.query(text, values)).rows;

async function call(method, path, key, body) {
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${SESSIONS[key]}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const visibleIds = async (prop, key = "visitor") =>
  (await call("GET", `/houses/${prop}`, key)).body.house.listings.map((l) => l.id);
const propose = (prop, sku, extra = {}) => call("POST", `/agent/${prop}/message`, "visitor", {
  message: "buy", tool: "create_checkout", args: { items: [{ sku, quantity: 1, unitAmountMinor: 1 }], ...extra },
});

async function seed() {
  // A legacy products row with a tempting price: the agent must never see it.
  await sql(`INSERT INTO products (merchant_id, sku, name, unit_amount_minor, currency, fulfillment, active)
             VALUES ('mer_dangg', $1, 'Legacy salon kit', 1, 'EUR', 'pickup', true)`, [LEGACY_SKU]);
  await sql(`INSERT INTO builder_offerings (id, builder_id, name, price_minor, currency, active)
             VALUES ($1, 'bld_dangg', 'Hidden DanGG chip', 5, 'EUR', false)`, [HIDDEN_ID]);
  await sql(`INSERT INTO agent_configs (property_id, name, tone, languages, allowed_actions)
             VALUES ('prop_dangg', 'Ava', 'warm', ARRAY['en'], ARRAY['search_catalog', 'create_checkout'])`);
}

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_p5" });
  store = new PostgresStore(db.url);
  await applySliceFixtures(store.pool);
  await seed();
  server = await startServer({
    port: await pickTestPort(PORT_SLOT),
    env: { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(","), SPEECH_BASE_URL: "", SPEECH_KEY: "" },
  });
});

test.after(async () => {
  server?.stop();
  await store?.pool.end();
  db?.drop();
});

it("each house's agent catalogue equals its visible listings, with no cross-merchant leakage", async () => {
  const dangg = agentCatalogue(await store.getHouse("prop_dangg"), "usr_visitor").map((p) => p.sku);
  const tb = agentCatalogue(await store.getHouse("prop_test"), "usr_visitor").map((p) => p.sku);
  assert.deepEqual(dangg, await visibleIds("prop_dangg"));
  assert.deepEqual(tb, await visibleIds("prop_test"));
  assert.ok(dangg.length > 0 && tb.length > 0);
  assert.deepEqual(dangg.filter((id) => tb.includes(id)), []);
  assert.ok(!dangg.includes(HIDDEN_ID) && !dangg.includes(LEGACY_SKU));
});

it("a checkout proposal prices every visible listing from builder_offerings, ignoring client prices", async () => {
  const rows = await sql("SELECT id, name, price_minor FROM builder_offerings WHERE builder_id = 'bld_dangg' AND active ORDER BY id");
  for (const row of rows) {
    const res = await propose("prop_dangg", row.id);
    assert.equal(res.status, 200, row.id);
    const { cart } = res.body.actions[0].args;
    assert.equal(cart.totalMinor, row.price_minor);
    assert.equal(cart.lines[0].name, row.name);
    assert.equal(cart.currency, "EUR");
  }
});

it("a foreign listing, an inactive listing or a legacy product cannot be checked out", async () => {
  for (const sku of [FOREIGN_ID, HIDDEN_ID, LEGACY_SKU]) {
    const res = await propose("prop_dangg", sku);
    assert.equal(res.status, 400, sku);
    assert.equal(res.body.error, "invalid_cart");
  }
});

it("a confirmed agent order is stored at the listing price with the catalogue's fulfilment", async () => {
  const proposed = await propose("prop_dangg", "off_dangg_2", { fulfillment: "delivery" });
  const confirmed = await call("POST", "/agent/prop_dangg/confirm", "visitor", { proposalId: proposed.body.actions[0].proposalId });
  assert.equal(confirmed.status, 200);
  const [order] = await sql("SELECT total_minor, merchant_id, fulfillment FROM orders WHERE id = $1", [confirmed.body.result.order.id]);
  const [listing] = await sql("SELECT price_minor FROM builder_offerings WHERE id = 'off_dangg_2'");
  assert.deepEqual(order, { total_minor: listing.price_minor, merchant_id: "mer_dangg", fulfillment: LISTING_FULFILLMENT });
  const items = await sql("SELECT sku, unit_amount_minor FROM order_items WHERE order_id = $1", [confirmed.body.result.order.id]);
  assert.deepEqual(items, [{ sku: "off_dangg_2", unit_amount_minor: listing.price_minor }]);
});

/** Run `fn` with a listing at a temporary price, always restoring the original. */
async function withPrice(id, priceMinor, fn) {
  const [{ price_minor: original }] = await sql("SELECT price_minor FROM builder_offerings WHERE id = $1", [id]);
  await sql("UPDATE builder_offerings SET price_minor = $2 WHERE id = $1", [id, priceMinor]);
  try {
    return await fn();
  } finally {
    await sql("UPDATE builder_offerings SET price_minor = $2 WHERE id = $1", [id, original]);
  }
}

it("an owner's price change reaches the very next proposal", async () => {
  await withPrice("off_dangg_1", 4321, async () => {
    const res = await propose("prop_dangg", "off_dangg_1");
    assert.equal(res.body.actions[0].args.cart.totalMinor, 4321);
  });
});

it("a price change between propose and confirm rejects the confirm with price_changed", async () => {
  const proposed = await propose("prop_dangg", "off_dangg_2");
  const { proposalId } = proposed.body.actions[0];
  const before = await sql("SELECT count(*)::int AS n FROM orders");
  const shown = proposed.body.actions[0].args.cart.totalMinor;
  const confirmed = await withPrice("off_dangg_2", shown + 1000, () =>
    call("POST", "/agent/prop_dangg/confirm", "visitor", { proposalId }));
  assert.equal(confirmed.status, 400);
  assert.equal(confirmed.body.error, "price_changed");
  assert.deepEqual(await sql("SELECT count(*)::int AS n FROM orders"), before);
  const again = await call("POST", "/agent/prop_dangg/confirm", "visitor", { proposalId });
  assert.equal(again.body.error, "proposal_not_found");
});

it("a house can never be bound to a merchant its owner does not own (getHouse relies on this)", async () => {
  const isForeignKey = (e) => e.code === "23503" && e.constraint === "properties_merchant_owner_fkey";
  await assert.rejects(sql("UPDATE merchants SET owner_id = 'usr_test' WHERE id = 'mer_dangg'"), isForeignKey);
  // A spare merchant owned by someone else, so the one-house-per-merchant index cannot answer first.
  await sql(`INSERT INTO merchants (id, owner_id, business_type, name, verified_at, suspended)
             VALUES ('mer_p5_foreign', 'usr_test', 'merchant', 'Foreign', now(), false)`);
  await assert.rejects(sql("UPDATE properties SET merchant_id = 'mer_p5_foreign' WHERE id = 'prop_dangg'"), isForeignKey);
  const house = await store.getHouse("prop_dangg");
  assert.equal(house.merchantId, "mer_dangg");
  assert.equal(house.builderId, "bld_dangg");
});

it("the agent's reply is grounded on this house's listings only", async () => {
  const own = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "starter bundle" });
  assert.equal(own.status, 200);
  assert.match(own.body.text, /DanGG Starter Bundle is 3999 EUR/);
  const other = await call("POST", "/agent/prop_test/message", "visitor", { message: "starter bundle" });
  assert.equal(other.status, 200);
  assert.doesNotMatch(other.body.text, /DanGG/);
  const legacy = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "legacy salon kit" });
  assert.doesNotMatch(legacy.body.text, /Legacy salon kit/i);
});

it("an unpublished house's agent sells nothing to visitors", async () => {
  await sql("UPDATE properties SET published = false WHERE id = 'prop_dangg'");
  try {
    const res = await propose("prop_dangg", "off_dangg_2");
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "invalid_cart");
    assert.deepEqual(agentCatalogue(await store.getHouse("prop_dangg"), "usr_visitor"), []);
  } finally {
    await sql("UPDATE properties SET published = true WHERE id = 'prop_dangg'");
  }
});
