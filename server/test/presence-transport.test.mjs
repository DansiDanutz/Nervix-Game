/**
 * C4 presence transport, pure parts, on a fake clock: the per-socket token
 * bucket, the per-room change batcher behind the 10 Hz deltas, ping/pong
 * liveness and the environment-driven capacity settings.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createTokenBucket, createRoomBatcher, createLiveness, presenceSettingsFromEnv, deliver,
  DEFAULT_MAX_BUFFERED_BYTES, DEFAULT_TICK_MS, DEFAULT_HEARTBEAT_MS, TRANSPORT_LIMITS,
} from "../src/presence-transport.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

test("the token bucket allows the burst, drops the rest, and refills with time", () => {
  const clock = createFakeClock();
  const bucket = createTokenBucket({ burst: 3, perSecond: 10 }, clock.now);
  const first = Array.from({ length: 5 }, () => bucket.take());
  assert.deepEqual(first, [true, true, true, false, false], "burst of 3, then drops");
  clock.advance(100);
  assert.equal(bucket.take(), true, "100 ms at 10/s refills one token");
  assert.equal(bucket.take(), false);
  clock.advance(10_000);
  assert.deepEqual(Array.from({ length: 4 }, () => bucket.take()), [true, true, true, false], "refill never exceeds the burst");
});

test("the token bucket counts its drops", () => {
  const clock = createFakeClock();
  const bucket = createTokenBucket({ burst: 1, perSecond: 1 }, clock.now);
  for (let i = 0; i < 4; i += 1) bucket.take();
  assert.equal(bucket.dropped(), 3);
});

test("the batcher coalesces many changes to one entry per player per room", () => {
  const batch = createRoomBatcher();
  for (let i = 0; i < 10; i += 1) batch.touch("plaza", "p_a");
  batch.touch("plaza", "p_b");
  batch.touch("openpoker", "p_c");
  const drained = batch.drain();
  assert.deepEqual(drained.map((d) => [d.place, [...d.changed].sort(), [...d.left]]), [
    ["plaza", ["p_a", "p_b"], []],
    ["openpoker", ["p_c"], []],
  ]);
  assert.deepEqual(batch.drain(), [], "a drained batch is empty until the next change");
});

test("the batcher records leaves, and a leave then return within one tick is a change", () => {
  const batch = createRoomBatcher();
  batch.leave("plaza", "p_a");
  batch.touch("prop_dangg", "p_a");
  batch.leave("prop_dangg", "p_b");
  batch.touch("prop_dangg", "p_b");
  const byPlace = Object.fromEntries(batch.drain().map((d) => [d.place, d]));
  assert.deepEqual([...byPlace.plaza.left], ["p_a"]);
  assert.deepEqual([...byPlace.prop_dangg.changed].sort(), ["p_a", "p_b"]);
  assert.deepEqual([...byPlace.prop_dangg.left], [], "p_b came back before the tick");
});

test("drained entries are frozen snapshots, not live state", () => {
  const batch = createRoomBatcher();
  batch.touch("plaza", "p_a");
  const [entry] = batch.drain();
  batch.touch("plaza", "p_b");
  assert.deepEqual([...entry.changed], ["p_a"]);
  assert.ok(Object.isFrozen(entry));
});

test("liveness pings on the first sweep and evicts a socket that never answered", () => {
  const live = createLiveness();
  const a = { name: "a" };
  const b = { name: "b" };
  let sweep = live.sweep([a, b]);
  assert.deepEqual(sweep.evict, []);
  assert.deepEqual(sweep.ping, [a, b]);
  live.seen(a); // a answered the ping
  sweep = live.sweep([a, b]);
  assert.deepEqual(sweep.evict, [b], "b missed a whole heartbeat");
  assert.deepEqual(sweep.ping, [a]);
});

test("liveness forgets a socket that has gone", () => {
  const live = createLiveness();
  const a = {};
  live.sweep([a]);
  live.forget(a);
  assert.deepEqual(live.sweep([]).evict, []);
  assert.deepEqual(live.sweep([a]).evict, [], "a reconnecting object starts fresh");
});

test("liveness does not keep a pinged socket alive after the server drops it", async () => {
  setFlagsFromString("--expose-gc");
  const gc = runInNewContext("gc");
  const live = createLiveness();
  const ref = (() => {
    const socket = {};
    live.sweep([socket]); // pinged, never answered, never forgotten
    return new WeakRef(socket);
  })();
  for (let i = 0; i < 5 && ref.deref(); i += 1) {
    await new Promise((r) => setImmediate(r));
    gc();
  }
  assert.equal(ref.deref(), undefined, "the pending set held the socket");
});

/** A socket double that records what deliver does to it. */
const fakeSocket = (bufferedAmount, readyState = 1) => {
  const calls = [];
  return { readyState, bufferedAmount, calls, send: (d) => calls.push(["send", d]), terminate: () => calls.push(["terminate"]) };
};

test("deliver sends under the backlog cap and terminates a socket past it", () => {
  const ok = fakeSocket(100);
  assert.equal(deliver(ok, "x", 1000), true);
  assert.deepEqual(ok.calls, [["send", "x"]]);
  const stalled = fakeSocket(1001);
  assert.equal(deliver(stalled, "x", 1000), false);
  assert.deepEqual(stalled.calls, [["terminate"]], "never queues more for a stalled reader");
  const closing = fakeSocket(0, 2);
  assert.equal(deliver(closing, "x", 1000), false);
  assert.deepEqual(closing.calls, []);
  assert.equal(DEFAULT_MAX_BUFFERED_BYTES, 1024 * 1024);
});

test("the defaults are a 10 Hz tick and a heartbeat of a few seconds", () => {
  assert.equal(DEFAULT_TICK_MS, 100);
  assert.ok(DEFAULT_HEARTBEAT_MS >= 5_000 && DEFAULT_HEARTBEAT_MS <= 30_000);
});

test("capacity and timing come from the environment, validated and bounded", () => {
  const settings = presenceSettingsFromEnv({
    PRESENCE_ROOM_CAPACITY: "50",
    PRESENCE_MAX_CONNECTIONS: "120",
    PRESENCE_TICK_MS: "50",
    PRESENCE_HEARTBEAT_MS: "10000",
  });
  assert.deepEqual(settings, { roomCapacity: 50, maxConnections: 120, tickMs: 50, heartbeatMs: 10_000 });
  assert.ok(Object.isFrozen(settings));
});

test("invalid or out-of-range settings are ignored, so the defaults apply", () => {
  const bad = presenceSettingsFromEnv({
    PRESENCE_ROOM_CAPACITY: "lots",
    PRESENCE_MAX_CONNECTIONS: "-5",
    PRESENCE_TICK_MS: String(TRANSPORT_LIMITS.tickMs.max + 1),
    PRESENCE_HEARTBEAT_MS: "1.5",
  });
  assert.deepEqual(bad, {});
  assert.deepEqual(presenceSettingsFromEnv({}), {});
  assert.deepEqual(presenceSettingsFromEnv(undefined), {});
});
