/**
 * C9 routes on a fake store (no database or port): GET and PUT /me/privacy
 * are session-only and rate limited, and POST /me/profile refuses a display
 * name that breaks the policy before anything is written.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createMeRoutes, PRIVACY_WRITES_PER_WINDOW } from "../src/routes/me.mjs";
import { AccessError } from "../src/entitlement.mjs";
import { DisplayNameError } from "../src/display-name.mjs";
import { PrivacyError } from "../src/presence-privacy.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";

const USERS = Object.freeze({ tok_a: Object.freeze({ id: "usr_a" }), tok_b: Object.freeze({ id: "usr_b" }) });

function fakeCtx(clock = createFakeClock()) {
  const rows = new Map();
  const writes = [];
  const store = {
    getSession: async (token) => USERS[token] ?? null,
    getPresenceSettings: async (userId) => rows.get(userId) ?? null,
    setPresenceSettings: async (userId, settings) => {
      writes.push(Object.freeze({ userId, ...settings }));
      rows.set(userId, Object.freeze({ ...settings }));
      return rows.get(userId);
    },
    completeProfile: async (userId, displayName) => writes.push(Object.freeze({ userId, displayName })),
  };
  return { routes: createMeRoutes(Object.freeze({ db: { store }, clock })), writes };
}

const params = (token) => ({ req: { headers: token ? { authorization: `Bearer ${token}` } : {} } });
const unauthorized = (e) => e instanceof AccessError && e.code === "unauthorized";

test("GET and PUT /me/privacy need a session", async () => {
  const { routes, writes } = fakeCtx();
  await assert.rejects(routes["GET /me/privacy"]({}, params(null)), unauthorized);
  await assert.rejects(routes["PUT /me/privacy"]({ hideName: true }, params(null)), unauthorized);
  assert.equal(writes.length, 0);
});

test("GET /me/privacy reads names visible by default", async () => {
  const { routes } = fakeCtx();
  assert.deepEqual(await routes["GET /me/privacy"]({}, params("tok_a")), { hideName: false, anonymous: false, source: "default" });
});

test("PUT /me/privacy merges onto the caller's own settings and GET reads them back", async () => {
  const { routes, writes } = fakeCtx();
  assert.deepEqual(await routes["PUT /me/privacy"]({ hideName: true, userId: "usr_b" }, params("tok_a")), { hideName: true, anonymous: false, source: "saved" });
  assert.deepEqual(await routes["PUT /me/privacy"]({ anonymous: true }, params("tok_a")), { hideName: true, anonymous: true, source: "saved" });
  assert.deepEqual(await routes["GET /me/privacy"]({}, params("tok_a")), { hideName: true, anonymous: true, source: "saved" });
  assert.deepEqual(await routes["GET /me/privacy"]({}, params("tok_b")), { hideName: false, anonymous: false, source: "default" }, "a body userId never redirects the write");
  assert.ok(writes.every((w) => w.userId === "usr_a"));
});

test("a malformed PUT /me/privacy is a PrivacyError and writes nothing", async () => {
  const { routes, writes } = fakeCtx();
  for (const body of [{}, { hideName: "on" }, { colour: "red" }]) {
    await assert.rejects(routes["PUT /me/privacy"](body, params("tok_a")), (e) => e instanceof PrivacyError, JSON.stringify(body));
  }
  assert.equal(writes.length, 0);
});

test("PUT /me/privacy is rate limited per user", async () => {
  const { routes, writes } = fakeCtx();
  for (let i = 0; i < PRIVACY_WRITES_PER_WINDOW; i += 1) await routes["PUT /me/privacy"]({ hideName: i % 2 === 0 }, params("tok_a"));
  await assert.rejects(routes["PUT /me/privacy"]({ hideName: true }, params("tok_a")), (e) => e instanceof AccessError && e.code === "cap_reached");
  assert.equal(writes.length, PRIVACY_WRITES_PER_WINDOW);
  await routes["PUT /me/privacy"]({ hideName: true }, params("tok_b"));
});

test("POST /me/profile refuses a disallowed display name before writing", async () => {
  const { routes, writes } = fakeCtx();
  for (const displayName of ["Guest", "Sh1t Lord", "usr_a", "<b>x</b>", "a"]) {
    await assert.rejects(routes["POST /me/profile"]({ displayName }, params("tok_a")), (e) => e instanceof DisplayNameError, displayName);
  }
  assert.equal(writes.length, 0);
});

test("POST /me/profile stores a cleaned allowed name, and no name keeps the current one", async () => {
  const { routes, writes } = fakeCtx();
  assert.equal((await routes["POST /me/profile"]({ displayName: "  Snapper  " }, params("tok_a"))).ok, true);
  assert.equal((await routes["POST /me/profile"]({}, params("tok_a"))).ok, true);
  assert.deepEqual(writes, [{ userId: "usr_a", displayName: "Snapper" }, { userId: "usr_a", displayName: undefined }]);
  assert.deepEqual(await routes["POST /me/profile"]({ displayName: "Snapper" }, params(null)), { error: "unauthorized" });
});

/** fakeCtx plus a live presence hook (index.mjs sets `db.presence` to the attachPresence server). */
function ctxWithPresence(refreshUser) {
  const store = {
    getSession: async (token) => USERS[token] ?? null,
    getPresenceSettings: async () => null,
    setPresenceSettings: async (_userId, settings) => Object.freeze({ ...settings }),
  };
  return createMeRoutes(Object.freeze({ db: { store, presence: { refreshUser } }, clock: createFakeClock() }));
}

test("a saved PUT /me/privacy refreshes the caller's live presence at once; a refused one does not", async () => {
  const refreshed = [];
  const routes = ctxWithPresence(async (userId) => { refreshed.push(userId); });
  await routes["PUT /me/privacy"]({ hideName: true }, params("tok_a"));
  await assert.rejects(routes["PUT /me/privacy"]({ hideName: "on" }, params("tok_a")));
  assert.deepEqual(refreshed, ["usr_a"]);
});

test("a failing presence refresh never fails the saved settings", async () => {
  const routes = ctxWithPresence(async () => { throw new Error("presence down"); });
  assert.deepEqual(await routes["PUT /me/privacy"]({ anonymous: true }, params("tok_a")), { hideName: false, anonymous: true, source: "saved" });
});
