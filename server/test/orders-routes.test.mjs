/**
 * S2 review fixes, unit level: the order routes against an in-memory fake
 * store (no Postgres). Covers the webhook in demo and live mode, fulfil
 * authority, server-side fulfilment and terms, the existence oracle and the
 * conditional (expected-state) save.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { AccessError } from "../src/entitlement.mjs";
import { createOrderRoutes } from "../src/routes/orders.mjs";
import { createOrder } from "../src/ledger.mjs";

const USERS = Object.freeze({
  tok_buyer: { id: "usr_buyer" },
  tok_owner: { id: "usr_owner" },
  tok_other: { id: "usr_other" },
});

const DEMO_ENV = Object.freeze({ NODE_ENV: "test" });
const LIVE_ENV = Object.freeze({
  NODE_ENV: "production",
  NERVIXPAY_MODE: "live",
  NERVIX_WORLD_SLICE: "0",
  NERVIXPAY_AGENT_TOKEN: "unit-test-dummy",
  NERVIXPAY_BASE_URL: "http://127.0.0.1:9",
});

function fakeStore() {
  const rows = new Map();
  const saves = [];
  return {
    rows,
    saves,
    async getSession(token) { return USERS[token] ?? null; },
    async getMerchant(id) { return id === "mer_a" ? { id, ownerId: "usr_owner", verified: true, suspended: false } : null; },
    async listProducts() {
      return [{ sku: "seat", name: "Seat", unitAmountMinor: 1750, currency: "EUR", fulfillment: "digital", active: true }];
    },
    async saveOrder(order, { expectedState = null } = {}) {
      saves.push({ id: order.id, state: order.state, expectedState });
      const current = rows.get(order.id);
      if (current && expectedState && current.state !== expectedState) {
        const error = new Error("order changed");
        error.name = "order_conflict";
        throw error;
      }
      rows.set(order.id, order);
    },
    async getOrder(id) { return rows.get(id) ?? null; },
  };
}

function setup({ env = DEMO_ENV, payments = null } = {}) {
  const store = fakeStore();
  const db = { orders: new Map(), catalog: [], store, payments };
  return { db, store, routes: createOrderRoutes({ db, registry: null, env }) };
}

const as = (token, extra = {}) => ({ req: { headers: token ? { authorization: `Bearer ${token}` } : {} }, ...extra });
const raw = (value) => ({ raw: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)), headers: {} });

async function newOrder(routes, body = {}) {
  const r = await routes["POST /orders"]({ merchantId: "mer_a", items: [{ sku: "seat", quantity: 1 }], ...body }, as("tok_buyer"));
  return r.order;
}

async function paidOrder(routes) {
  const order = await newOrder(routes);
  const r = await routes["POST /orders/:id/events"]({ eventId: `pay_${order.id}`, type: "payment_succeeded" }, as("tok_buyer", { id: order.id }));
  assert.equal(r.order.state, "paid");
  return r.order;
}

test("the demo webhook is refused: nobody can mark an order paid without a session", async () => {
  const { routes, store } = setup();
  const order = await newOrder(routes);
  const r = await routes["POST /webhooks/nervixpay"](raw({ event: "payment.paid", orderId: order.id }), as(null));
  assert.equal(r.error, "demo_only");
  assert.equal(store.rows.get(order.id).state, "created");
});

test("the demo webhook refuses a malformed body without echoing parser text", async () => {
  const { routes } = setup();
  const r = await routes["POST /webhooks/nervixpay"](raw("{nope"), as(null));
  assert.equal(r.error, "demo_only");
  assert.doesNotMatch(JSON.stringify(r), /SyntaxError|JSON|Expected|position/i);
});

test("in live mode a payload the adapter cannot verify returns a generic invalid_payload", async () => {
  const payments = { verifyWebhook() { throw new SyntaxError("Expected property name or '}' in JSON at position 1"); } };
  const { routes } = setup({ env: LIVE_ENV, payments });
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  try {
    const r = await routes["POST /webhooks/nervixpay"](raw("{nope"), as(null));
    assert.deepEqual(r, { error: "invalid_payload" });
  } finally {
    console.error = original;
  }
  assert.ok(logged.some((line) => line.includes("Expected property name")), "details are logged on the server");
});

test("in live mode a transition error or a store conflict never escapes the webhook handler", async () => {
  const payments = { verifyWebhook: (rawBody) => ({ ...JSON.parse(rawBody.toString("utf8")), type: "payment_succeeded" }) };
  const { routes, store } = setup({ env: LIVE_ENV, payments });
  const order = createOrder({ id: "ord_live_1", buyerId: "usr_buyer", merchantId: "mer_a", currency: "EUR", fulfillment: "digital", items: [{ sku: "seat", name: "Seat", unitAmountMinor: 1750, quantity: 1 }] });
  store.rows.set(order.id, { ...order, state: "expired" });
  const original = console.error;
  console.error = () => {};
  try {
    const r = await routes["POST /webhooks/nervixpay"](raw({ eventId: "ev1", orderId: order.id }), as(null));
    assert.deepEqual(r, { error: "invalid_payload" });
  } finally {
    console.error = original;
  }
  assert.equal(store.rows.get(order.id).state, "expired");
});

test("the buyer cannot fulfil their own order; the merchant owner can", async () => {
  const { routes } = setup();
  const order = await paidOrder(routes);
  await assert.rejects(
    routes["POST /orders/:id/fulfil"]({}, as("tok_buyer", { id: order.id })),
    (error) => error instanceof AccessError && error.code === "forbidden",
  );
  const r = await routes["POST /orders/:id/fulfil"]({}, as("tok_owner", { id: order.id }));
  assert.equal(r.order.state, "fulfilled");
});

test("fulfilment comes from the catalogue and terms are set by the server", async () => {
  const { routes, store } = setup();
  const order = await newOrder(routes, { fulfillment: "teleport", terms: "free forever" });
  assert.equal(order.fulfillment, "digital");
  assert.equal(order.terms, "demo");
  assert.equal(store.rows.get(order.id).fulfillment, "digital");
});

test("mutations on someone else's order look exactly like a missing order", async () => {
  const { routes } = setup();
  const order = await paidOrder(routes);
  const calls = [["events", { eventId: "x", type: "payment_refunded" }], ["fulfil", {}], ["refund", { reason: "x" }]];
  for (const [path, body] of calls) {
    const route = routes[`POST /orders/:id/${path}`];
    const foreign = await route(body, as("tok_other", { id: order.id }));
    const missing = await route(body, as("tok_other", { id: "ord_missing" }));
    assert.deepEqual(foreign, missing, path);
    assert.deepEqual(foreign, { error: "not_found" }, path);
  }
});

test("each state change is saved conditionally on the state it was read in", async () => {
  const { routes, store } = setup();
  const order = await paidOrder(routes);
  await routes["POST /orders/:id/refund"]({ reason: "x" }, as("tok_owner", { id: order.id }));
  assert.deepEqual(store.saves.map((s) => [s.state, s.expectedState]), [["created", null], ["paid", "created"], ["refunded", "paid"]]);
});

test("a conflicting save fails, drops the stale cached copy, and the next read sees the stored state", async () => {
  const { routes, store, db } = setup();
  const order = await paidOrder(routes);
  // Another process refunded the order behind this one's back.
  store.rows.set(order.id, { ...order, state: "refunded" });
  await assert.rejects(routes["POST /orders/:id/fulfil"]({}, as("tok_owner", { id: order.id })), (error) => error.name === "order_conflict");
  assert.equal(db.orders.has(order.id), false);
  const seen = await routes["GET /orders/:id"]({}, as("tok_buyer", { id: order.id }));
  assert.equal(seen.order.state, "refunded");
});
