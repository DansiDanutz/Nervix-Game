/**
 * S3: private merchant conversations, against the real server on a throwaway
 * Postgres database with the slice fixtures.
 *
 * - Conversations are keyed by (property, session user); B never sees A's turns.
 * - /message, /confirm and /speak need an authenticated, eligible caller.
 * - The merchant comes from the property, never from the request body.
 * - /confirm runs under the merchant's own agent config.
 * - Errors are non-200 statuses. /speak is captions-only (decision D8).
 * - Histories stay separate after a server restart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 3;
const EXPLORE_SESSION = "sess_s3_explore";
const DANGG_FACT = "DanGG poker tables open at nine every evening.";
const TEST_SECRET = "Test Builder secret midnight blueprint discount.";

const available = pgAvailable();
let db;
let pool;
let server;
let port;
let serverEnv;

async function call(method, path, session, body) {
  const headers = { "content-type": "application/json" };
  if (session) headers.authorization = `Bearer ${SESSIONS[session] ?? session}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const contents = (history) => (history ?? []).map((turn) => turn.content);

async function seedConversationData(q) {
  await q(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
           VALUES ('usr_s3_explore', 'usr_s3_explore@fixture.nervix.invalid', 'Explorer', 'player', true, false)`);
  await q(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, 'usr_s3_explore', now() + interval '1 day')`, [EXPLORE_SESSION]);
  await q(`INSERT INTO knowledge_sources (merchant_id, kind, content, approved) VALUES ('mer_dangg', 'faq', $1, true)`, [DANGG_FACT]);
  await q(`INSERT INTO knowledge_sources (merchant_id, kind, content, approved) VALUES ('mer_test', 'faq', $1, true)`, [TEST_SECRET]);
  // DanGG's own agent: support requests allowed, checkout not (the demo default allows checkout).
  await q(`INSERT INTO agent_configs (property_id, name, tone, languages, allowed_actions)
           VALUES ('prop_dangg', 'Ava', 'warm', ARRAY['en'], ARRAY['search_catalog', 'request_support'])`);
}

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_s3" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  await seedConversationData((sql, args) => pool.query(sql, args));
  port = await pickTestPort(PORT_SLOT);
  serverEnv = { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(","), SPEECH_BASE_URL: "", SPEECH_KEY: "" };
  server = await startServer({ port, env: serverEnv });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

it("message without a session is 401", async () => {
  const res = await call("POST", "/agent/prop_dangg/message", null, { message: "hi" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "unauthorized");
});

it("message from an EXPLORE-level account is 403", async () => {
  const res = await call("POST", "/agent/prop_dangg/message", EXPLORE_SESSION, { message: "hi" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "insufficient_level");
});

it("message to an unknown property is a non-200 error", async () => {
  const res = await call("POST", "/agent/prop_nope/message", "visitor", { message: "hi" });
  assert.notEqual(res.status, 200);
  assert.equal(res.body.error, "unknown_property");
});

it("B's history never contains A's turns", async () => {
  const a = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "A asks about the tables" });
  assert.equal(a.status, 200);
  const b = await call("POST", "/agent/prop_dangg/message", "sub", { message: "B asks something else" });
  assert.equal(b.status, 200);
  assert.deepEqual(contents(b.body.history), ["B asks something else"]);
  assert.ok(contents(a.body.history).includes("A asks about the tables"));
  assert.ok(!contents(a.body.history).includes("B asks something else"));
});

it("a userId in the body does not select another user's conversation", async () => {
  const res = await call("POST", "/agent/prop_dangg/message", "sub", { message: "B again", userId: "usr_visitor" });
  assert.equal(res.status, 200);
  assert.ok(!contents(res.body.history).includes("A asks about the tables"));
  assert.deepEqual(contents(res.body.history), ["B asks something else", "B again"]);
});

it("a foreign merchantId in the body still grounds on the property's own merchant", async () => {
  const res = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "test builder secret midnight blueprint discount", merchantId: "mer_test" });
  assert.equal(res.status, 200);
  assert.ok(!String(res.body.text).includes("Test Builder secret"), res.body.text);
  const { rows } = await pool.query("SELECT id FROM knowledge_sources WHERE merchant_id = 'mer_dangg' AND approved");
  const own = rows.map((r) => String(r.id)).sort();
  assert.deepEqual(res.body.citations.map((c) => String(c.id)).sort(), own);

  const grounded = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "when do poker tables open", merchantId: "mer_test" });
  assert.equal(grounded.body.text, DANGG_FACT);
});

it("confirm without a session is 401", async () => {
  const res = await call("POST", "/agent/prop_dangg/confirm", null, { action: { tool: "request_support", args: {}, confirmationRequired: true, acknowledged: true } });
  assert.equal(res.status, 401);
});

it("confirm runs under the merchant's agent config, as the session user", async () => {
  const proposed = await call("POST", "/agent/prop_dangg/message", "visitor", {
    message: "please call me", tool: "request_support", args: { message: "please call me" }, userId: "usr_sub", merchantId: "mer_test",
  });
  assert.equal(proposed.status, 200);
  const support = await call("POST", "/agent/prop_dangg/confirm", "visitor", {
    proposalId: proposed.body.actions[0].proposalId,
    userId: "usr_sub",
    merchantId: "mer_test",
  });
  assert.equal(support.status, 200);
  assert.equal(support.body.result.support.userId, "usr_visitor");

  // The demo default config allows create_checkout; DanGG's own config does not.
  const checkout = await call("POST", "/agent/prop_dangg/message", "visitor", {
    message: "buy", tool: "create_checkout", args: { items: [{ sku: "x", quantity: 1 }] },
  });
  assert.equal(checkout.body.denied, "create_checkout");
  assert.deepEqual(checkout.body.actions, []);
});

it("a support request stays in the requester's own conversation", async () => {
  const { rows } = await pool.query("SELECT user_id, support FROM user_conversations WHERE property_id = 'prop_dangg' ORDER BY user_id");
  const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r.support]));
  assert.equal(byUser.usr_visitor.length, 1);
  assert.deepEqual(byUser.usr_sub, []);
});

it("speak needs a session, rejects unknown properties and is captions-only", async () => {
  assert.equal((await call("POST", "/agent/prop_dangg/speak", null, { text: "hello" })).status, 401);
  assert.equal((await call("POST", "/agent/prop_dangg/speak", EXPLORE_SESSION, { text: "hello" })).status, 403);
  const unknown = await call("POST", "/agent/prop_nope/speak", "visitor", { text: "hello" });
  assert.notEqual(unknown.status, 200);
  const ok = await call("POST", "/agent/prop_dangg/speak", "visitor", { text: "hello" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { available: false, audioUrl: null, captionsOnly: true });
});

it("the monthly cap is a non-200 error", async () => {
  await pool.query("UPDATE agent_configs SET monthly_request_cap = 0 WHERE property_id = 'prop_dangg'");
  try {
    const res = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "hi" });
    assert.notEqual(res.status, 200);
    assert.equal(res.body.error, "cap_reached");
  } finally {
    await pool.query("UPDATE agent_configs SET monthly_request_cap = NULL WHERE property_id = 'prop_dangg'");
  }
});

it("histories stay separate after a restart; the old table is kept", async () => {
  server.stop();
  server = await startServer({ port: await pickTestPort(PORT_SLOT), env: serverEnv });
  const a = await call("POST", "/agent/prop_dangg/message", "visitor", { message: "A after restart" });
  const b = await call("POST", "/agent/prop_dangg/message", "sub", { message: "B after restart" });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(contents(a.body.history)[0], "A asks about the tables");
  assert.equal(contents(a.body.history).at(-1), "A after restart");
  assert.ok(!contents(a.body.history).some((c) => c.startsWith("B ")));
  assert.deepEqual(contents(b.body.history), ["B asks something else", "B again", "B after restart"]);

  const legacy = await pool.query("SELECT to_regclass('public.conversations') AS t");
  assert.equal(legacy.rows[0].t, "conversations");
  const shared = await pool.query("SELECT count(*)::int AS n FROM conversations WHERE property_id = 'prop_dangg'");
  assert.equal(shared.rows[0].n, 0, "the shared per-property row is no longer written");
});
