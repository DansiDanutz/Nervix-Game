/**
 * The sliding-window write limiter used by PUT /me/avatar (C5 repair):
 * a fixed number of writes per key per window, driven by an injected clock.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createWriteLimiter } from "../src/write-limiter.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";

const WINDOW_MS = 60_000;

test("allows up to the limit inside one window, then refuses", () => {
  const clock = createFakeClock(1_000);
  const limiter = createWriteLimiter({ limit: 3, windowMs: WINDOW_MS, now: clock.now });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take("usr_a")), [true, true, true, false]);
});

test("keys are independent", () => {
  const clock = createFakeClock();
  const limiter = createWriteLimiter({ limit: 1, windowMs: WINDOW_MS, now: clock.now });
  assert.equal(limiter.take("usr_a"), true);
  assert.equal(limiter.take("usr_b"), true);
  assert.equal(limiter.take("usr_a"), false);
});

test("a refused attempt does not consume the budget, and old writes expire", () => {
  const clock = createFakeClock();
  const limiter = createWriteLimiter({ limit: 2, windowMs: WINDOW_MS, now: clock.now });
  limiter.take("k");
  clock.advance(10_000);
  limiter.take("k");
  assert.equal(limiter.take("k"), false);
  clock.advance(WINDOW_MS - 10_000);
  assert.equal(limiter.take("k"), true, "the first write left the window");
  assert.equal(limiter.take("k"), false, "the second write is still inside it");
});

test("rejects a non-positive limit or window", () => {
  assert.throws(() => createWriteLimiter({ limit: 0, windowMs: WINDOW_MS }), RangeError);
  assert.throws(() => createWriteLimiter({ limit: 2, windowMs: 0 }), RangeError);
});
