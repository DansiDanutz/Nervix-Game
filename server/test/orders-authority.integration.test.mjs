/**
 * S2: order, payment-event and progress authority against a real Postgres
 * database (throwaway, local socket) and the real server.
 *
 * The server runs with NODE_ENV=test and *dummy* NervixPay token env vars set
 * (pointing at a closed local port), so it also proves the slice never builds
 * the live adapter: every checkout must come back from the demo adapter.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";
import { PostgresStore } from "../src/store.mjs";

const PORT_SLOT = 3;
const available = pgAvailable();
let db;
let pool;
let server;

const DUMMY_LIVE_ENV = Object.freeze({
  NERVIXPAY_MODE: "live",
  NERVIXPAY_AGENT_TOKEN: "tok_dummy_never_used",
  NERVIXPAY_BASE_URL: "http://127.0.0.1:9",
  NERVIXPAY_WEBHOOK_SECRET: "whsec_dummy_never_used",
});

async function call(method, path, sessionKey, body) {
  const headers = { "content-type": "application/json" };
  if (sessionKey) headers.authorization = `Bearer ${SESSIONS[sessionKey]}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const seatOrder = (extra = {}) => ({ merchantId: "mer_dangg", items: [{ sku: "seat", quantity: 2 }], ...extra });

async function createPaidOrder() {
  const created = await call("POST", "/orders", "visitor", seatOrder());
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.order.id;
  const paid = await call("POST", `/orders/${id}/events`, "visitor", { eventId: `pay_${id}`, type: "payment_succeeded" });
  assert.equal(paid.body.order?.state, "paid", JSON.stringify(paid.body));
  return id;
}

async function merchantIds() {
  return (await pool.query("SELECT id FROM merchants ORDER BY id")).rows.map((r) => r.id);
}

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_s2" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  await pool.query(
    `INSERT INTO products (merchant_id, sku, name, unit_amount_minor, currency, fulfillment, active) VALUES
       ('mer_dangg', 'seat', 'Salon seat', 1750, 'EUR', 'digital', true),
       ('mer_dangg', 'retired', 'Retired', 5, 'EUR', 'digital', false),
       ('mer_unverified', 'thing', 'Thing', 100, 'EUR', 'digital', true)`);
  await pool.query("INSERT INTO quests (id, title) VALUES ('lost-seals', 'The Lost Seals') ON CONFLICT (id) DO NOTHING");
  server = await startServer({
    port: await pickTestPort(PORT_SLOT),
    env: { ...DUMMY_LIVE_ENV, DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(",") },
  });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

// (1) server pricing
it("a tampered unitAmountMinor gives a server-priced total, and buyerId comes from the session", async () => {
  const r = await call("POST", "/orders", "visitor", seatOrder({
    buyerId: "usr_test",
    currency: "USD",
    items: [{ sku: "seat", quantity: 2, unitAmountMinor: 1, name: "Free seat", lineTotalMinor: 2 }],
  }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order.totalMinor, 3500);
  assert.equal(r.body.order.currency, "EUR");
  assert.equal(r.body.order.buyerId, "usr_visitor");
  assert.equal(r.body.order.merchantId, "mer_dangg");
  assert.deepEqual(r.body.order.items.map((i) => [i.sku, i.name, i.unitAmountMinor, i.lineTotalMinor]), [["seat", "Salon seat", 1750, 3500]]);
  const row = (await pool.query("SELECT buyer_id, total_minor FROM orders WHERE id = $1", [r.body.order.id])).rows[0];
  assert.deepEqual(row, { buyer_id: "usr_visitor", total_minor: 3500 });
});

it("unknown or inactive skus are rejected", async () => {
  for (const sku of ["nope", "retired"]) {
    const r = await call("POST", "/orders", "visitor", seatOrder({ items: [{ sku, quantity: 1 }] }));
    assert.equal(r.status, 400, sku);
  }
});

it("ordering needs a session", async () => {
  const r = await call("POST", "/orders", null, { ...seatOrder(), buyerId: "usr_visitor" });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "unauthorized");
});

// (4) the slice never builds the live adapter
it("with token env vars set under NODE_ENV=test, checkout stays on the demo adapter", async () => {
  const r = await call("POST", "/orders", "visitor", seatOrder());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.checkout.provider, "nervixpay-demo");
  assert.equal(r.body.checkout.demo, true);
  assert.equal(r.body.checkout.amountMinor, 3500);
});

// (6) /orders never creates merchants
it("an unknown merchantId is rejected and leaves the merchants table unchanged", async () => {
  const before = await merchantIds();
  const r = await call("POST", "/orders", "visitor", seatOrder({ merchantId: "mer_invented" }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "unknown_merchant");
  assert.deepEqual(await merchantIds(), before);
});

it("a missing merchantId or an unverified merchant is rejected", async () => {
  const before = await merchantIds();
  assert.equal((await call("POST", "/orders", "visitor", { items: [{ sku: "seat", quantity: 1 }] })).status, 400);
  const r = await call("POST", "/orders", "visitor", { merchantId: "mer_unverified", items: [{ sku: "thing", quantity: 1 }] });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "merchant_unavailable");
  assert.deepEqual(await merchantIds(), before);
});

// (3) demo pay event
it("the demo pay event moves a CREATED order to paid", async () => {
  const created = await call("POST", "/orders", "visitor", seatOrder());
  assert.equal(created.body.order.state, "created");
  const id = created.body.order.id;
  const r = await call("POST", `/orders/${id}/events`, "visitor", { eventId: `e_${id}`, type: "payment_succeeded" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order.state, "paid");
  const replay = await call("POST", `/orders/${id}/events`, "visitor", { eventId: `e_${id}`, type: "payment_succeeded" });
  assert.equal(replay.body.order.state, "paid", "a replayed event is a no-op");
  assert.equal((await pool.query("SELECT state FROM orders WHERE id = $1", [id])).rows[0].state, "paid");
});

it("a demo event with no eventId or type is rejected", async () => {
  const created = await call("POST", "/orders", "visitor", seatOrder());
  const r = await call("POST", `/orders/${created.body.order.id}/events`, "visitor", { type: "payment_succeeded" });
  assert.equal(r.status, 400);
});

// (2) fulfil / refund / events authority
it("events, fulfil and refund without a session are rejected", async () => {
  const id = await createPaidOrder();
  for (const [path, body] of [["events", { eventId: "x", type: "payment_succeeded" }], ["fulfil", {}], ["refund", { reason: "x" }]]) {
    const r = await call("POST", `/orders/${id}/${path}`, null, body);
    assert.equal(r.status, 401, path);
  }
  assert.equal((await pool.query("SELECT state FROM orders WHERE id = $1", [id])).rows[0].state, "paid");
});

it("events, fulfil and refund by another user are rejected exactly like a missing order", async () => {
  const id = await createPaidOrder();
  for (const [path, body] of [["events", { eventId: "y", type: "payment_refunded" }], ["fulfil", {}], ["refund", { reason: "x" }]]) {
    const foreign = await call("POST", `/orders/${id}/${path}`, "test", body);
    const missing = await call("POST", `/orders/ord_missing_${path}/${path}`, "test", body);
    assert.deepEqual(foreign, missing, `${path}: no existence oracle`);
    assert.deepEqual(foreign.body, { error: "not_found" }, path);
  }
  assert.equal((await pool.query("SELECT state FROM orders WHERE id = $1", [id])).rows[0].state, "paid");
});

it("the buyer cannot fulfil their own order", async () => {
  const id = await createPaidOrder();
  const r = await call("POST", `/orders/${id}/fulfil`, "visitor", {});
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "forbidden");
  assert.equal((await pool.query("SELECT state FROM orders WHERE id = $1", [id])).rows[0].state, "paid");
});

// S2 review: the unsigned demo webhook must not move anyone's order
it("an unauthenticated webhook cannot change an order's state", async () => {
  const created = await call("POST", "/orders", "visitor", seatOrder());
  const id = created.body.order.id;
  const res = await fetch(`${server.base}/webhooks/nervixpay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "payment.paid", orderId: id }),
  });
  // 200 with an error body: the dispatcher (F0) answers the raw webhook route with 200.
  assert.equal((await res.json()).error, "demo_only");
  assert.equal((await pool.query("SELECT state FROM orders WHERE id = $1", [id])).rows[0].state, "created");
  assert.equal((await call("GET", `/orders/${id}`, "visitor")).body.order.state, "created");
});

it("a malformed webhook body gets no parser text back", async () => {
  const res = await fetch(`${server.base}/webhooks/nervixpay`, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
  const text = await res.text();
  assert.equal(JSON.parse(text).error, "demo_only");
  assert.doesNotMatch(text, /SyntaxError|Expected property/);
});

it("fulfilment and terms are set by the server, not the client", async () => {
  const r = await call("POST", "/orders", "visitor", seatOrder({ fulfillment: "teleport", terms: "free forever" }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order.fulfillment, "digital");
  assert.equal(r.body.order.terms, "demo");
  const row = (await pool.query("SELECT fulfillment, terms FROM orders WHERE id = $1", [r.body.order.id])).rows[0];
  assert.deepEqual(row, { fulfillment: "digital", terms: "demo" });
});

it("concurrent fulfil and refund never leave the stored state behind a reported success", async () => {
  const id = await createPaidOrder();
  const [fulfilled, refunded] = await Promise.all([
    call("POST", `/orders/${id}/fulfil`, "dangg", {}),
    call("POST", `/orders/${id}/refund`, "dangg", { reason: "race" }),
  ]);
  const stored = (await pool.query("SELECT state FROM orders WHERE id = $1", [id])).rows[0].state;
  const won = [fulfilled, refunded].filter((r) => r.body.order).map((r) => r.body.order.state);
  assert.ok(won.length >= 1, JSON.stringify([fulfilled.body, refunded.body]));
  if (won.length === 2) assert.equal(stored, "refunded", "both applied, so they ran in order");
  else assert.equal(stored, won[0], "the losing write did not overwrite the winner");
});

it("the store refuses a save whose expected state is stale", async () => {
  const store = new PostgresStore(db.url);
  try {
    const id = await createPaidOrder();
    const order = await store.getOrder(id);
    await assert.rejects(store.saveOrder({ ...order, state: "fulfilled" }, { expectedState: "created" }), (error) => error.name === "order_conflict");
    assert.equal((await store.getOrder(id)).state, "paid");
    await store.saveOrder({ ...order, state: "fulfilled" }, { expectedState: "paid" });
    assert.equal((await store.getOrder(id)).state, "fulfilled");
  } finally {
    await store.close();
  }
});

it("the merchant owner can fulfil and refund, and the buyer sees the result", async () => {
  const id = await createPaidOrder();
  assert.equal((await call("POST", `/orders/${id}/fulfil`, "dangg", {})).body.order.state, "fulfilled");
  assert.equal((await call("POST", `/orders/${id}/refund`, "dangg", { reason: "test" })).body.order.state, "refunded");
  const seen = await call("GET", `/orders/${id}`, "visitor");
  assert.equal(seen.body.order.state, "refunded");
});

it("the buyer can refund their own paid order", async () => {
  const id = await createPaidOrder();
  assert.equal((await call("POST", `/orders/${id}/refund`, "visitor", { reason: "changed mind" })).body.order.state, "refunded");
});

// (5) reads are scoped to the session
it("visitor A cannot read B's orders", async () => {
  const id = await createPaidOrder();
  const mine = await call("GET", "/orders", "visitor");
  assert.ok(mine.body.orders.some((o) => o.id === id));
  const theirs = await call("GET", "/orders?buyerId=usr_visitor", "test");
  assert.equal(theirs.status, 200);
  assert.deepEqual(theirs.body.orders, []);
  const one = await call("GET", `/orders/${id}`, "test");
  assert.deepEqual(one.body, { error: "not_found" });
  assert.equal((await call("GET", `/orders/${id}`, "dangg")).body.order.id, id, "the merchant owner can read it");
  assert.equal((await call("GET", "/orders?buyerId=usr_visitor")).status, 401);
  assert.equal((await call("GET", `/orders/${id}`)).status, 401);
});

it("visitor A cannot read or write B's progress", async () => {
  const step = await call("POST", "/progress", "visitor", { userId: "usr_test", step: "find-fountain" });
  assert.equal(step.status, 200, JSON.stringify(step.body));
  assert.equal(step.body.progress.stepIndex, 1);
  assert.equal((await call("GET", "/progress?userId=usr_test", "visitor")).body.progress.stepIndex, 1);
  const other = await call("GET", "/progress?userId=usr_visitor", "test");
  assert.equal(other.body.progress.stepIndex, 0, "B sees only their own (fresh) progress");
  const rows = (await pool.query("SELECT user_id FROM progress ORDER BY user_id")).rows.map((r) => r.user_id);
  assert.deepEqual(rows, ["usr_visitor"], "the body userId was ignored");
  const anon = await call("GET", "/progress?userId=usr_visitor");
  assert.equal(anon.body.progress.stepIndex, 0, "signed-out readers get a fresh, unsaved quest");
  assert.equal((await call("POST", "/progress", null, { userId: "usr_visitor", step: "meet-guide" })).status, 401);
});
