/**
 * C8 fixture walkers, unit level: the DEMO-only guard, fixture-only identities
 * and the wander logic. No sockets are opened here, except to prove none are.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { WALKERS, isFixtureWalker } from "../seed/fixtures/walkers.mjs";
import { USERS, SESSIONS } from "../seed/fixtures/index.mjs";
import { DEFAULT_PLACE_BOUNDS, PRESET_IDS } from "../src/presence-places.mjs";
import { validateDisplayName } from "../src/display-name.mjs";
import {
  WALK_SPEED_MPS, mulberry32, parseWalkerArgs, plazaLayout, runWalkers, selectWalkers, sessionCookie,
  isBlocked, startWanderer, stepWanderer, walkerRefusal,
} from "../scripts/fixture-walkers.mjs";

const SLICE_ON = Object.freeze({ NERVIX_WORLD_SLICE: "1" });
const DEMO_HEALTH = Object.freeze({ ok: true, demo: true });
const MANIFEST = JSON.parse(readFileSync(new URL("../../app/public/slice/manifest.json", import.meta.url), "utf8"));

test("refuses unless NERVIX_WORLD_SLICE is explicitly on", () => {
  for (const value of [undefined, "", "0", "false", "off", "maybe"]) {
    assert.equal(walkerRefusal({ NERVIX_WORLD_SLICE: value }, DEMO_HEALTH), "slice_off", String(value));
  }
  for (const value of ["1", "true", "on", "TRUE"]) assert.equal(walkerRefusal({ NERVIX_WORLD_SLICE: value }, DEMO_HEALTH), null, value);
});

test("refuses live payments, production and a server that is not in DEMO mode", () => {
  assert.equal(walkerRefusal({ ...SLICE_ON, NERVIXPAY_MODE: "live" }, DEMO_HEALTH), "live_payments");
  assert.equal(walkerRefusal({ ...SLICE_ON, NODE_ENV: "production" }, DEMO_HEALTH), "production");
  assert.equal(walkerRefusal(SLICE_ON, { ok: true, demo: false }), "not_demo");
  assert.equal(walkerRefusal(SLICE_ON, { ok: true }), "not_demo");
  assert.equal(walkerRefusal(SLICE_ON, null), "not_demo");
  assert.equal(walkerRefusal(SLICE_ON, DEMO_HEALTH), null);
});

test("runWalkers refuses outside DEMO before opening any socket", async () => {
  const opened = [];
  class SpySocket {
    constructor(url) {
      opened.push(url);
    }
  }
  const healthy = async () => ({ ok: true, json: async () => DEMO_HEALTH });
  const notDemo = async () => ({ ok: true, json: async () => ({ ok: true, demo: false }) });
  const base = { port: 40123, count: 2, seconds: 0.1, WebSocketImpl: SpySocket };
  await assert.rejects(runWalkers({ ...base, env: {}, fetchImpl: healthy }), /slice_off/);
  await assert.rejects(runWalkers({ ...base, env: { ...SLICE_ON, NERVIXPAY_MODE: "live" }, fetchImpl: healthy }), /live_payments/);
  await assert.rejects(runWalkers({ ...base, env: SLICE_ON, fetchImpl: notDemo }), /not_demo/);
  await assert.rejects(runWalkers({ ...base, env: SLICE_ON, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } }), /not_demo/);
  assert.deepEqual(opened, []);
});

test("arguments: a port is required, peer ports are refused, identities cannot be passed in", () => {
  assert.deepEqual({ ...parseWalkerArgs(["--port", "28797"]) }, { port: 28797, count: 6, seconds: 0, hz: 5, seed: 1 });
  assert.equal(parseWalkerArgs(["--port", "40000", "--count", "3", "--seconds", "20", "--hz", "4", "--seed", "9"]).count, 3);
  assert.throws(() => parseWalkerArgs([]), /--port/);
  assert.throws(() => parseWalkerArgs(["--port", "8787"]), /peer/);
  assert.throws(() => parseWalkerArgs(["--port", "18787"]), /peer/);
  assert.throws(() => parseWalkerArgs(["--port", "70000"]), /--port/);
  assert.throws(() => parseWalkerArgs(["--port", "40000", "--count", String(WALKERS.length + 1)]), /--count/);
  for (const flag of ["--session", "--cookie", "--user", "--host", "--url"]) {
    assert.throws(() => parseWalkerArgs(["--port", "40000", flag, "x"]), /unknown option/, flag);
  }
});

test("walkers are fixture users only: walker ids, fixture sessions, contract presets, no collision", () => {
  assert.ok(WALKERS.length >= 6);
  const userIds = new Set(USERS.map(([id]) => id));
  const sessions = new Set(Object.values(SESSIONS));
  for (const w of WALKERS) {
    assert.match(w.userId, /^usr_walker_[a-z]+$/);
    assert.match(w.sessionId, /^sess_fixture_walker_[a-z]+$/);
    assert.match(w.name, /^Demo [A-Z][a-z]+$/);
    assert.deepEqual(validateDisplayName(w.name), { ok: true, name: w.name }, "presence would show it as Anonymous");
    assert.ok(PRESET_IDS.includes(w.preset), w.preset);
    assert.ok(!userIds.has(w.userId) && !sessions.has(w.sessionId));
    assert.ok(Object.isFrozen(w));
  }
  assert.equal(new Set(WALKERS.map((w) => w.userId)).size, WALKERS.length);
  assert.ok(Object.isFrozen(WALKERS));
});

test("only a listed fixture walker gets a session cookie", () => {
  assert.equal(sessionCookie(WALKERS[0]), `nervix_session=${WALKERS[0].sessionId}`);
  assert.ok(isFixtureWalker(WALKERS[0]));
  const forged = { ...WALKERS[0], sessionId: "sess_real_user" };
  assert.ok(!isFixtureWalker(forged));
  assert.throws(() => sessionCookie(forged), /not a fixture walker/);
  assert.throws(() => sessionCookie({ userId: "usr_dangg", sessionId: SESSIONS.dangg, name: "DanGG" }), /not a fixture walker/);
  assert.deepEqual(selectWalkers(3), WALKERS.slice(0, 3));
});

test("plaza layout comes from the slice manifest and sits inside the server's plaza clamp", () => {
  const layout = plazaLayout(MANIFEST);
  const clamp = DEFAULT_PLACE_BOUNDS.plaza;
  assert.ok(layout.bounds.minX >= clamp.minX && layout.bounds.maxX <= clamp.maxX);
  assert.ok(layout.bounds.minZ >= clamp.minZ && layout.bounds.maxZ <= clamp.maxZ);
  assert.ok(isBlocked(layout, MANIFEST.runtime_layout.plaza.fountain.x, MANIFEST.runtime_layout.plaza.fountain.z));
  assert.throws(() => plazaLayout({}), /plaza/);
});

test("a wanderer stays inside the plaza, off the fountain and obstacles, at walking pace", () => {
  const layout = plazaLayout(MANIFEST);
  const rng = mulberry32(42);
  let w = startWanderer(rng, layout);
  const dt = 0.2;
  let moved = 0;
  for (let i = 0; i < 3000; i += 1) {
    const next = stepWanderer(w, dt, rng, layout);
    const step = Math.hypot(next.x - w.x, next.z - w.z);
    assert.ok(step <= WALK_SPEED_MPS * dt + 1e-9, `step ${step}`);
    moved += step;
    assert.ok(next.x >= layout.bounds.minX && next.x <= layout.bounds.maxX && next.z >= layout.bounds.minZ && next.z <= layout.bounds.maxZ);
    assert.ok(!isBlocked(layout, next.x, next.z), `blocked at ${next.x},${next.z}`);
    assert.ok(Object.isFrozen(next));
    w = next;
  }
  assert.ok(moved > 100, `wandered ${moved} m`);
});

test("wanderer yaw follows the presence convention: forward = (-sin yaw, -cos yaw)", () => {
  const layout = plazaLayout(MANIFEST);
  const rng = mulberry32(7);
  let w = startWanderer(rng, layout);
  for (let i = 0; i < 200; i += 1) {
    const next = stepWanderer(w, 0.2, rng, layout);
    const dx = next.x - w.x;
    const dz = next.z - w.z;
    if (Math.hypot(dx, dz) > 0.1) {
      assert.ok(Math.abs(-Math.sin(next.yaw) - dx / Math.hypot(dx, dz)) < 1e-6);
      assert.ok(Math.abs(-Math.cos(next.yaw) - dz / Math.hypot(dx, dz)) < 1e-6);
    }
    w = next;
  }
});

test("the seeded RNG is deterministic", () => {
  const a = mulberry32(3);
  const b = mulberry32(3);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
});
