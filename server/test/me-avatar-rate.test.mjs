/**
 * PUT /me/avatar is rate limited per session user (C5 repair): a few writes
 * per minute, then 429 cap_reached with no store write. Route-level test on a
 * fake store and an injected clock; no database or port needed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createMeRoutes, AVATAR_WRITES_PER_WINDOW, AVATAR_WRITE_WINDOW_MS } from "../src/routes/me.mjs";
import { AccessError } from "../src/entitlement.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";

const USERS = Object.freeze({ tok_a: Object.freeze({ id: "usr_a" }), tok_b: Object.freeze({ id: "usr_b" }) });

function fakeCtx(clock) {
  const writes = [];
  const store = {
    getSession: async (token) => USERS[token] ?? null,
    getAvatar: async () => null,
    setAvatarPreset: async (userId, preset) => {
      writes.push(Object.freeze({ userId, preset }));
      return { preset };
    },
  };
  return { ctx: Object.freeze({ db: { store }, clock }), writes };
}

const params = (token) => ({ req: { headers: { authorization: `Bearer ${token}` } } });

test("the limit is a few writes per minute", () => {
  assert.ok(AVATAR_WRITES_PER_WINDOW >= 3 && AVATAR_WRITES_PER_WINDOW <= 10);
  assert.equal(AVATAR_WRITE_WINDOW_MS, 60_000);
});

test("writes past the limit are refused with cap_reached and never reach the store", async () => {
  const clock = createFakeClock();
  const { ctx, writes } = fakeCtx(clock);
  const put = createMeRoutes(ctx)["PUT /me/avatar"];
  for (let i = 0; i < AVATAR_WRITES_PER_WINDOW; i += 1) await put({ preset: "sage" }, params("tok_a"));
  await assert.rejects(put({ preset: "linen" }, params("tok_a")), (e) => e instanceof AccessError && e.code === "cap_reached");
  assert.equal(writes.length, AVATAR_WRITES_PER_WINDOW);
  assert.ok(writes.every((w) => w.preset === "sage"));
});

test("another user keeps their own budget, and the window reopens after a minute", async () => {
  const clock = createFakeClock();
  const { ctx } = fakeCtx(clock);
  const put = createMeRoutes(ctx)["PUT /me/avatar"];
  for (let i = 0; i < AVATAR_WRITES_PER_WINDOW; i += 1) await put({ preset: "sage" }, params("tok_a"));
  assert.deepEqual(await put({ preset: "teal" }, params("tok_b")), { preset: "teal", source: "saved" });
  clock.advance(AVATAR_WRITE_WINDOW_MS);
  assert.deepEqual(await put({ preset: "linen" }, params("tok_a")), { preset: "linen", source: "saved" });
});

test("invalid bodies are rejected before the limiter and do not spend the budget", async () => {
  const clock = createFakeClock();
  const { ctx, writes } = fakeCtx(clock);
  const put = createMeRoutes(ctx)["PUT /me/avatar"];
  for (let i = 0; i < AVATAR_WRITES_PER_WINDOW + 2; i += 1) {
    await assert.rejects(put({ preset: "purple" }, params("tok_a")), { name: "invalid_avatar" });
  }
  assert.deepEqual(await put({ preset: "sage" }, params("tok_a")), { preset: "sage", source: "saved" });
  assert.equal(writes.length, 1);
});
