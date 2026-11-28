/**
 * C5 over HTTP on a throwaway database with the slice fixtures plus the
 * fixture avatars: GET and PUT /me/avatar are session-only, write the caller's
 * own row in the existing `avatars` table, and accept contract presets only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SESSION_OWNERS, SUBSCRIBERS } from "../seed/fixtures/index.mjs";
import { applyAvatars, AVATARS } from "../seed/fixtures/avatars.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 9;
const available = pgAvailable();
let db;
let pool;
let server;

async function call(method, path, key, body) {
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${SESSIONS[key]}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const storedPreset = async (userId) =>
  (await pool.query("SELECT config->>'preset' AS preset FROM avatars WHERE user_id = $1", [userId])).rows[0]?.preset ?? null;

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_c5" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  await applyAvatars((sql, args) => pool.query(sql, args));
  server = await startServer({ port: await pickTestPort(PORT_SLOT), env: { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(",") } });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it("GET /me/avatar without a session is 401", async () => {
  const r = await call("GET", "/me/avatar");
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "unauthorized");
});

it("PUT /me/avatar without a session is 401 and writes nothing", async () => {
  const before = (await pool.query("SELECT count(*)::int AS n FROM avatars")).rows[0].n;
  const r = await call("PUT", "/me/avatar", null, { preset: "sage" });
  assert.equal(r.status, 401);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM avatars")).rows[0].n, before);
});

it("each fixture session reads its own distinct preset", async () => {
  const seen = new Map();
  for (const [key, userId] of Object.entries(SESSION_OWNERS)) {
    const r = await call("GET", "/me/avatar", key);
    assert.equal(r.status, 200, key);
    assert.deepEqual(r.body, { preset: AVATARS[userId], source: "saved" }, key);
    seen.set(key, r.body.preset);
  }
  assert.equal(new Set(seen.values()).size, seen.size);
});

it("PUT /me/avatar stores a contract preset on the caller's row and GET reads it back", async () => {
  const r = await call("PUT", "/me/avatar", "visitor", { preset: "linen" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { preset: "linen", source: "saved" });
  assert.equal(await storedPreset("usr_visitor"), "linen");
  assert.deepEqual((await call("GET", "/me/avatar", "visitor")).body, { preset: "linen", source: "saved" });
});

it("an invalid preset is rejected with 400 and leaves the row unchanged", async () => {
  const before = await storedPreset("usr_test");
  for (const body of [{ preset: "purple" }, { preset: 7 }, {}, { preset: "teal", palette: { tunic: "#ff0000" } }]) {
    const r = await call("PUT", "/me/avatar", "test", body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.error, "invalid_avatar");
  }
  assert.equal(await storedPreset("usr_test"), before);
});

it("a user cannot write another user's avatar: a body userId is ignored", async () => {
  const danggBefore = await storedPreset("usr_dangg");
  const r = await call("PUT", "/me/avatar", "test", { preset: "sage", userId: "usr_dangg" });
  assert.equal(r.status, 200);
  assert.equal(await storedPreset("usr_test"), "sage");
  assert.equal(await storedPreset("usr_dangg"), danggBefore);
});

it("a signed-in user without a row gets the default preset", async () => {
  await pool.query("DELETE FROM avatars WHERE user_id = 'usr_sub'");
  assert.deepEqual((await call("GET", "/me/avatar", "sub")).body, { preset: "teal", source: "default" });
});

it("the fixture loader is idempotent and restores the fixture presets", async () => {
  await applyAvatars((sql, args) => pool.query(sql, args));
  await applyAvatars((sql, args) => pool.query(sql, args));
  const { rows } = await pool.query("SELECT user_id, config->>'preset' AS preset FROM avatars ORDER BY user_id");
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.user_id, r.preset])), { ...AVATARS });
});
