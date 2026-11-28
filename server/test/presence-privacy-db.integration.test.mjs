/**
 * C9 on a throwaway database: migration 019 stores hide-name and anonymous
 * settings per user, GET and PUT /me/privacy read and write only the caller's
 * row over HTTP, the presence resolver reads the same row, and POST
 * /me/profile answers 400 invalid_display_name for a disallowed name.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS } from "../seed/fixtures/index.mjs";
import { presenceStoreResolvers } from "../src/presence-resolvers.mjs";
import { PostgresStore } from "../src/store.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 12;
const available = pgAvailable();
let db;
let pool;
let store;
let server;

async function call(method, path, key, body) {
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${SESSIONS[key]}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const row = async (userId) =>
  (await pool.query("SELECT hide_name, anonymous FROM presence_settings WHERE user_id = $1", [userId])).rows[0] ?? null;
const displayName = async (userId) => (await pool.query("SELECT display_name FROM users WHERE id = $1", [userId])).rows[0].display_name;

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_c9" });
  pool = new pg.Pool({ connectionString: db.url });
  store = new PostgresStore(db.url);
  await applySliceFixtures(pool);
  server = await startServer({ port: await pickTestPort(PORT_SLOT), env: { DATABASE_URL: db.url } });
});

test.after(async () => {
  server?.stop();
  await store?.close();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it("migration 019 adds presence_settings with names visible by default and a user foreign key", async () => {
  await pool.query("INSERT INTO presence_settings (user_id) VALUES ('usr_sub')");
  assert.deepEqual(await row("usr_sub"), { hide_name: false, anonymous: false });
  await assert.rejects(pool.query("INSERT INTO presence_settings (user_id) VALUES ('usr_nobody')"), /foreign key/);
  await pool.query("DELETE FROM presence_settings WHERE user_id = 'usr_sub'");
});

it("the store reads null before any write, then upserts and reads back frozen settings", async () => {
  assert.equal(await store.getPresenceSettings("usr_test"), null);
  const saved = await store.setPresenceSettings("usr_test", { hideName: true, anonymous: false });
  assert.equal(saved.hideName, true);
  assert.equal(saved.anonymous, false);
  assert.ok(Object.isFrozen(saved));
  await store.setPresenceSettings("usr_test", { hideName: false, anonymous: true });
  assert.deepEqual(await row("usr_test"), { hide_name: false, anonymous: true });
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM presence_settings WHERE user_id = 'usr_test'")).rows[0].n, 1);
});

it("GET and PUT /me/privacy without a session are 401 and write nothing", async () => {
  assert.equal((await call("GET", "/me/privacy")).status, 401);
  const before = (await pool.query("SELECT count(*)::int AS n FROM presence_settings")).rows[0].n;
  assert.equal((await call("PUT", "/me/privacy", null, { hideName: true })).status, 401);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM presence_settings")).rows[0].n, before);
});

it("PUT /me/privacy writes the caller's own row and GET reads it back", async () => {
  assert.deepEqual((await call("GET", "/me/privacy", "visitor")).body, { hideName: false, anonymous: false, source: "default" });
  const put = await call("PUT", "/me/privacy", "visitor", { hideName: true, userId: "usr_dangg" });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body, { hideName: true, anonymous: false, source: "saved" });
  assert.deepEqual(await row("usr_visitor"), { hide_name: true, anonymous: false });
  assert.equal(await row("usr_dangg"), null, "a body userId is ignored");
});

it("a malformed PUT /me/privacy is 400 invalid_privacy", async () => {
  const r = await call("PUT", "/me/privacy", "dangg", { hideName: "yes" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_privacy");
  assert.equal(await row("usr_dangg"), null);
});

it("the presence resolver reads the stored settings, and null for a user without a row", async () => {
  const { resolvePrivacy } = presenceStoreResolvers({ db: { store } });
  assert.deepEqual(await resolvePrivacy("usr_visitor"), { hideName: true, anonymous: false });
  assert.equal(await resolvePrivacy("usr_unverified"), null);
  assert.equal(await resolvePrivacy(null), null);
});

it("POST /me/profile with a disallowed name is 400 invalid_display_name and keeps the stored name", async () => {
  const before = await displayName("usr_dangg");
  for (const name of ["Guest", "Sh1t Lord", "usr_admin"]) {
    const r = await call("POST", "/me/profile", "dangg", { displayName: name });
    assert.equal(r.status, 400, name);
    assert.equal(r.body.error, "invalid_display_name", name);
  }
  assert.equal(await displayName("usr_dangg"), before);
  const ok = await call("POST", "/me/profile", "dangg", { displayName: "DanGG" });
  assert.equal(ok.status, 200);
});
