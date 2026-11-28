/**
 * C8: the documented seed path for the fixture walkers (seed/walker-fixtures.mjs),
 * named in the scripts/fixture-walkers.mjs header. No database: the pool is a recorder.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { WALKERS } from "../seed/fixtures/walkers.mjs";
import { seedWalkerFixtures, SEED_COMMAND } from "../seed/walker-fixtures.mjs";

const SLICE_ON = Object.freeze({ NERVIX_WORLD_SLICE: "1" });

function recorder() {
  const calls = [];
  return { calls, query: async (sql, args) => (calls.push({ sql, args }), { rows: [] }) };
}

test("the documented path seeds every walker's user, avatar and session", async () => {
  const pool = recorder();
  const seeded = await seedWalkerFixtures(pool, SLICE_ON);
  assert.deepEqual(seeded, WALKERS.map((w) => w.name));
  for (const w of WALKERS) {
    assert.ok(pool.calls.some((c) => /INSERT INTO users/.test(c.sql) && c.args[0] === w.userId), `user ${w.key}`);
    assert.ok(pool.calls.some((c) => /INSERT INTO avatars/.test(c.sql) && c.args[0] === w.userId && c.args[1] === w.preset), `avatar ${w.key}`);
    assert.ok(pool.calls.some((c) => /INSERT INTO sessions/.test(c.sql) && c.args[0] === w.sessionId), `session ${w.key}`);
  }
});

test("seeding refuses outside the slice, with live payments or in production, before any query", async () => {
  for (const [env, reason] of [[{}, /slice_off/], [{ ...SLICE_ON, NERVIXPAY_MODE: "live" }, /live_payments/], [{ ...SLICE_ON, NODE_ENV: "production" }, /production/]]) {
    const pool = recorder();
    await assert.rejects(seedWalkerFixtures(pool, env), reason);
    assert.equal(pool.calls.length, 0);
  }
});

test("the walker service header names the seed command", () => {
  const header = readFileSync(new URL("../scripts/fixture-walkers.mjs", import.meta.url), "utf8").split("*/")[0];
  assert.ok(header.includes(SEED_COMMAND), `header mentions: ${SEED_COMMAND}`);
  assert.match(SEED_COMMAND, /node seed\/walker-fixtures\.mjs/);
});
