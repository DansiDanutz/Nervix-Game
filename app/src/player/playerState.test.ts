import test from "node:test";
import assert from "node:assert/strict";
import { createPlayerState, INITIAL_PLAYER, nextSnapshot } from "./playerState.ts";

test("the initial snapshot is at rest at the origin and frozen", () => {
  assert.deepEqual(INITIAL_PLAYER, { x: 0, z: 0, yaw: 0, speed: 0, tMs: 0 });
  assert.equal(Object.isFrozen(INITIAL_PLAYER), true);
});

test("speed is distance over elapsed time in metres per second", () => {
  const a = nextSnapshot(INITIAL_PLAYER, { x: 0, z: 0, yaw: 0, tMs: 1000 });
  const b = nextSnapshot(a, { x: 3, z: 4, yaw: 0.5, tMs: 2000 });
  assert.equal(b.speed, 5);
  assert.equal(b.yaw, 0.5);
});

test("a zero or negative time step keeps the previous speed", () => {
  const a = { ...INITIAL_PLAYER, speed: 2, tMs: 500 };
  assert.equal(nextSnapshot(a, { x: 9, z: 9, yaw: 0, tMs: 500 }).speed, 2);
  assert.equal(nextSnapshot(a, { x: 9, z: 9, yaw: 0, tMs: 400 }).speed, 2);
});

test("the first sample after the initial snapshot reports zero speed", () => {
  assert.equal(nextSnapshot(INITIAL_PLAYER, { x: 20, z: 1, yaw: 0, tMs: 16 }).speed, 0);
});

test("non-finite samples are ignored", () => {
  const a = nextSnapshot(INITIAL_PLAYER, { x: 1, z: 1, yaw: 0, tMs: 10 });
  assert.equal(nextSnapshot(a, { x: Number.NaN, z: 1, yaw: 0, tMs: 20 }), a);
});

test("readers get frozen snapshots and never a writer", () => {
  const state = createPlayerState();
  state.publish({ x: 1, z: 2, yaw: 0.3, tMs: 100 });
  const snap = state.ref.current;
  assert.equal(Object.isFrozen(snap), true);
  assert.equal(snap.x, 1);
  assert.equal("publish" in state.ref, false);
  assert.throws(() => {
    (state.ref as { current: unknown }).current = null;
  });
});

test("publishing returns a new snapshot and leaves the old one unchanged", () => {
  const state = createPlayerState();
  state.publish({ x: 1, z: 0, yaw: 0, tMs: 1000 });
  const before = state.ref.current;
  state.publish({ x: 2, z: 0, yaw: 0, tMs: 2000 });
  assert.notEqual(state.ref.current, before);
  assert.equal(before.x, 1);
  assert.equal(state.ref.current.speed, 1);
});

test("a teleport or door jump reads as standing still, not a one-frame run burst", () => {
  const state = createPlayerState();
  state.publish({ x: 0, z: 0, yaw: 0, tMs: 1000 });
  state.publish({ x: 0.07, z: 0, yaw: 0, tMs: 1010 }); // a normal run step: 7 m/s
  assert.ok(Math.abs(state.ref.current.speed - 7) < 1e-9);
  state.publish({ x: 40, z: 0, yaw: 0, tMs: 1026 }); // a 40 m jump in 16 ms
  assert.equal(state.ref.current.speed, 0);
  assert.equal(state.ref.current.x, 40);
});
