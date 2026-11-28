/**
 * S3 review fixes against the real server on a throwaway Postgres database:
 *
 * - /confirm runs only a proposal the server built and stored in the caller's
 *   own conversation; a client-sent action is refused.
 * - Agent checkout is priced from the catalogue and needs a verified merchant.
 * - A property without an agent config cannot check out.
 * - /confirm checks the monthly cap and records usage.
 * - History and support requests are bounded; concurrent first loads keep both turns.
 * - Errors carry fixed codes, never internal detail.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { HISTORY_MAX, SUPPORT_MAX } from "../src/conversation.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 4;
const RACE_SESSION = "sess_s3h_race";
const KIT_PRICE = 2500;

const available = pgAvailable();
let db;
let pool;
let server;

async function call(method, path, session, body) {
  const headers = { "content-type": "application/json" };
  if (session) headers.authorization = `Bearer ${SESSIONS[session] ?? session}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const orderCount = async () => (await pool.query("SELECT count(*)::int AS n FROM orders")).rows[0].n;
const usage = async (propertyId) =>
  (await pool.query("SELECT coalesce(sum(requests), 0)::int AS n FROM agent_usage WHERE property_id = $1", [propertyId])).rows[0].n;

const tamperedCart = { cart: { lines: [{ sku: "kit", name: "Free", unitAmountMinor: 1, quantity: 2, lineTotalMinor: 2, currency: "EUR" }], totalMinor: 2, currency: "EUR" } };

async function seed(q) {
  await q(`INSERT INTO products (merchant_id, sku, name, unit_amount_minor, currency, fulfillment, active) VALUES
             ('mer_test', 'kit', 'Builder kit', ${KIT_PRICE}, 'EUR', 'pickup', true),
             ('mer_unverified', 'thing', 'Thing', 100, 'EUR', 'pickup', true)`);
  const checkout = "ARRAY['search_catalog', 'prepare_cart', 'create_checkout', 'request_support']";
  await q(`INSERT INTO agent_configs (property_id, name, tone, languages, allowed_actions)
           VALUES ('prop_dangg', 'Ava', 'warm', ARRAY['en'], ${checkout}),
                  ('prop_unverified', 'Uno', 'warm', ARRAY['en'], ${checkout})`);
  await q(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, 'usr_test', now() + interval '1 day')`, [RACE_SESSION]);
}

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_s3h" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  await seed((sql, args) => pool.query(sql, args));
  server = await startServer({
    port: await pickTestPort(PORT_SLOT),
    env: { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(","), SPEECH_BASE_URL: "", SPEECH_KEY: "" },
  });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

it("the reported exploit is refused: a client-sent action never runs", async () => {
  const before = await orderCount();
  const res = await call("POST", "/agent/prop_unverified/confirm", "visitor", {
    action: { tool: "create_checkout", args: { cart: { lines: [{ sku: "anything", unitAmountMinor: 1, quantity: 1, currency: "EUR" }], currency: "EUR" } }, confirmationRequired: true, acknowledged: true },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "proposal_required");
  assert.equal(await orderCount(), before);
});

it("a tampered cart is proposed and charged at the catalogue total", async () => {
  // prop_dangg has an agent config that allows checkout; give mer_dangg the kit too.
  await pool.query(`INSERT INTO products (merchant_id, sku, name, unit_amount_minor, currency, fulfillment, active)
                    VALUES ('mer_dangg', 'kit', 'Salon kit', $1, 'EUR', 'pickup', true)`, [KIT_PRICE]);
  const proposed = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "buy two kits", tool: "create_checkout", args: tamperedCart });
  assert.equal(proposed.status, 200);
  const [action] = proposed.body.actions;
  assert.equal(action.args.cart.totalMinor, 2 * KIT_PRICE);
  assert.equal(action.args.cart.lines[0].name, "Salon kit");

  // The client resends the action with its own prices; only the proposal id counts.
  const confirmed = await call("POST", "/agent/prop_dangg/confirm", "visitor", {
    action: { ...action, args: tamperedCart, acknowledged: true },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.result.order.totalMinor, 2 * KIT_PRICE);

  const { rows } = await pool.query("SELECT total_minor, merchant_id, buyer_id FROM orders WHERE id = $1", [confirmed.body.result.order.id]);
  assert.deepEqual(rows[0], { total_minor: 2 * KIT_PRICE, merchant_id: "mer_dangg", buyer_id: "usr_visitor" });

  const replay = await call("POST", "/agent/prop_dangg/confirm", "visitor", { proposalId: action.proposalId });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, "proposal_not_found");
});

it("another user cannot confirm someone else's proposal", async () => {
  const proposed = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "buy a kit", tool: "create_checkout", args: { items: [{ sku: "kit", quantity: 1 }] } });
  const before = await orderCount();
  const stolen = await call("POST", "/agent/prop_dangg/confirm", "sub", { proposalId: proposed.body.actions[0].proposalId });
  assert.equal(stolen.status, 400);
  assert.equal(stolen.body.error, "proposal_not_found");
  assert.equal(await orderCount(), before);
});

it("an unverified merchant cannot take an agent checkout", async () => {
  const before = await orderCount();
  const res = await call("POST", "/agent/prop_unverified/message", "visitor", { message: "buy", tool: "create_checkout", args: { items: [{ sku: "thing", quantity: 1 }] } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "merchant_unavailable");
  assert.equal(await orderCount(), before);
});

it("a property without an agent config cannot check out", async () => {
  const before = await orderCount();
  const res = await call("POST", "/agent/prop_test/message", "visitor", { message: "buy", tool: "create_checkout", args: { items: [{ sku: "kit", quantity: 1 }] } });
  assert.equal(res.status, 200);
  assert.equal(res.body.denied, "create_checkout");
  assert.deepEqual(res.body.actions, []);
  assert.equal(await orderCount(), before);
});

it("an empty message with a tool is rejected", async () => {
  const res = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "  ", tool: "request_support", args: { message: "x" } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_input");
});

it("/confirm checks the monthly cap and records usage", async () => {
  const proposed = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "help", tool: "request_support", args: { message: "call me" } });
  const id = proposed.body.actions[0].proposalId;
  const used = await usage("prop_dangg");
  await pool.query("UPDATE agent_configs SET monthly_request_cap = $1 WHERE property_id = 'prop_dangg'", [used]);
  try {
    const capped = await call("POST", "/agent/prop_dangg/confirm", "visitor", { proposalId: id });
    assert.notEqual(capped.status, 200);
    assert.equal(capped.body.error, "cap_reached");
  } finally {
    await pool.query("UPDATE agent_configs SET monthly_request_cap = NULL WHERE property_id = 'prop_dangg'");
  }
  const ok = await call("POST", "/agent/prop_dangg/confirm", "visitor", { proposalId: id });
  assert.equal(ok.status, 200);
  assert.equal(await usage("prop_dangg"), used + 1);
});

it("stored history is bounded", async () => {
  for (let i = 0; i < HISTORY_MAX + 3; i++) {
    const res = await call("POST", "/agent/prop_dangg/message", "sub", { message: `turn ${i}` });
    assert.equal(res.status, 200);
  }
  const { rows } = await pool.query("SELECT history FROM user_conversations WHERE property_id = 'prop_dangg' AND user_id = 'usr_sub'");
  assert.equal(rows[0].history.length, HISTORY_MAX);
  assert.equal(rows[0].history.at(-1).content, `turn ${HISTORY_MAX + 2}`);
});

it("support requests per conversation are capped", async () => {
  const propose = () => call("POST", "/agent/prop_dangg/message", "dangg", { message: "help", tool: "request_support", args: { message: "flood" } });
  for (let i = 0; i < SUPPORT_MAX; i++) {
    const p = await propose();
    const c = await call("POST", "/agent/prop_dangg/confirm", "dangg", { proposalId: p.body.actions[0].proposalId });
    assert.equal(c.status, 200, JSON.stringify(c.body));
  }
  const over = await propose();
  assert.equal(over.status, 400);
  assert.equal(over.body.error, "support_limit");
  const { rows } = await pool.query("SELECT support FROM user_conversations WHERE property_id = 'prop_dangg' AND user_id = 'usr_dangg'");
  assert.equal(rows[0].support.length, SUPPORT_MAX);
});

it("concurrent first requests from one user keep both turns", async () => {
  const [a, b] = await Promise.all([
    call("POST", "/agent/prop_test/message", RACE_SESSION, { message: "first" }),
    call("POST", "/agent/prop_test/message", RACE_SESSION, { message: "second" }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const { rows } = await pool.query("SELECT history FROM user_conversations WHERE property_id = 'prop_test' AND user_id = 'usr_test'");
  assert.deepEqual(rows[0].history.map((t) => t.content).sort(), ["first", "second"]);
});

it("tool errors carry a fixed code and no internal detail", async () => {
  const res = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "buy", tool: "create_checkout", args: { items: [{ sku: "ghost_internal_sku", quantity: 1 }] } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_cart");
  assert.ok(!JSON.stringify(res.body).includes("ghost_internal_sku"));
});
