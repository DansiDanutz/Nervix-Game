import test from "node:test";
import assert from "node:assert/strict";

import { checkCap, monthKey, addUsage, UsageError } from "../src/usage.mjs";

test("no cap means always allowed", () => {
  assert.deepEqual(checkCap({ cap: null, used: 999 }), { allowed: true, remaining: null });
});

test("a cap blocks once reached", () => {
  assert.deepEqual(checkCap({ cap: 2, used: 1 }), { allowed: true, remaining: 1 });
  assert.deepEqual(checkCap({ cap: 2, used: 2 }), { allowed: false, remaining: 0 });
});

test("negative caps and usage are refused", () => {
  assert.throws(() => checkCap({ cap: -1 }), UsageError);
  assert.throws(() => checkCap({ cap: 1, used: -1 }), UsageError);
  assert.throws(() => addUsage({ requests: -1 }), UsageError);
});

test("month key is zero padded", () => {
  assert.match(monthKey(new Date("2026-01-05T00:00:00Z")), /^2026-01$/);
});