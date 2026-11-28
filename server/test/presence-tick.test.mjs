/**
 * C4 presence transport on real sockets and a fake clock: 10 Hz tick deltas,
 * per-socket rate-limit drops and ping/pong eviction. Time only moves when the
 * test advances the clock; `sync` waits until the server has handled
 * everything a socket sent.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { attachPresence } from "../src/presence.mjs";
import { DEFAULT_TICK_MS } from "../src/presence-transport.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";
import { closeAll, closed, join, open, selfIn, send, settle, sync, withPresence } from "./helpers/presenceClient.mjs";

const TICK = DEFAULT_TICK_MS;
const deltas = (ws) => ws.frames.map((f) => JSON.parse(f)).filter((f) => f.type === "delta");

/** A presence server on a fake clock with the default 10 Hz tick. */
function withClock(options, fn) {
  const clock = createFakeClock();
  return withPresence(attachPresence, { tickMs: TICK, clock, ...options }, (url) => fn(url, clock));
}

/** Two joined sockets; the join deltas are flushed and received. */
async function pair(url, clock) {
  const watcher = await open(url);
  const mover = await open(url);
  const ww = await join(watcher);
  const wm = await join(mover);
  clock.advance(TICK);
  await sync(watcher);
  await sync(mover);
  return { watcher, mover, ww, wm };
}

test("moves inside one tick reach others as one delta with the latest state", withClock({}, async (url, clock) => {
  const { watcher, mover, wm } = await pair(url, clock);
  const before = deltas(watcher).length;
  for (let seq = 1; seq <= 5; seq += 1) send(mover, { type: "move", x: seq, z: 0, seq });
  await sync(mover);
  await sync(watcher);
  assert.equal(deltas(watcher).length, before, "nothing is sent between ticks");

  clock.advance(TICK);
  await sync(watcher);
  const sent = deltas(watcher).slice(before);
  assert.equal(sent.length, 1, "one delta per tick");
  assert.deepEqual(sent[0].players.map((p) => [p.id, p.x, p.seq]), [[wm.id, 5, 5]]);
  assert.deepEqual(sent[0].left, []);
  assert.equal(sent[0].place, "plaza");
  closeAll(watcher, mover);
}));

test("an idle tick sends nothing, and a delta lists only the players who changed", withClock({}, async (url, clock) => {
  const { watcher, mover, wm } = await pair(url, clock);
  const idle = await open(url);
  await join(idle);
  clock.advance(TICK);
  await sync(watcher);
  const before = deltas(watcher).length;
  clock.advance(TICK * 3);
  await sync(watcher);
  assert.equal(deltas(watcher).length, before, "no change, no frame");

  send(mover, { type: "move", x: 2, z: 2, seq: 1 });
  await sync(mover);
  clock.advance(TICK);
  await sync(watcher);
  const [delta] = deltas(watcher).slice(before);
  assert.deepEqual(delta.players.map((p) => p.id), [wm.id], "the idle player is not resent");
  closeAll(watcher, mover, idle);
}));

test("joins and leaves are batched into the tick delta", withClock({}, async (url, clock) => {
  const { watcher, mover, ww, wm } = await pair(url, clock);
  const late = await open(url);
  const wl = await join(late);
  const gone = closed(mover);
  mover.close();
  await gone;
  await settle(30); // the server sees the close
  await sync(watcher);
  assert.ok(watcher.room.players.has(wm.id), "still listed until the tick");

  clock.advance(TICK);
  await sync(watcher);
  const delta = deltas(watcher).at(-1);
  assert.deepEqual(delta.left, [wm.id]);
  assert.deepEqual(delta.players.map((p) => p.id), [wl.id]);
  assert.deepEqual([...watcher.room.players.keys()].sort(), [ww.id, wl.id].sort());
  closeAll(watcher, late);
}));

test("a delta's players carry exactly the public fields", withClock({}, async (url, clock) => {
  const { watcher, mover } = await pair(url, clock);
  send(mover, { type: "move", x: 1, z: 1, yaw: 0.5, seq: 1 });
  await sync(mover);
  clock.advance(TICK);
  await sync(watcher);
  const [player] = deltas(watcher).at(-1).players;
  assert.deepEqual(Object.keys(player).sort(), ["district", "id", "name", "place", "preset", "seq", "x", "yaw", "z"]);
  assert.deepEqual(Object.keys(deltas(watcher).at(-1)).sort(), ["left", "place", "players", "tick", "type"]);
  closeAll(watcher, mover);
}));

test("moves over the rate are dropped, and the bucket refills with time", withClock({ moveLimit: { burst: 3, perSecond: 10 } }, async (url, clock) => {
  const { watcher, mover, wm } = await pair(url, clock);
  for (let seq = 1; seq <= 10; seq += 1) send(mover, { type: "move", x: seq, z: 0, seq });
  await sync(mover);
  clock.advance(TICK);
  await sync(watcher);
  assert.deepEqual([selfIn(deltas(watcher).at(-1), wm.id).x, selfIn(deltas(watcher).at(-1), wm.id).seq], [3, 3], "only the burst of 3 applied");

  clock.advance(1000 - TICK); // one second of refill at 10/s, capped at the burst
  await sync(watcher);
  for (let seq = 11; seq <= 20; seq += 1) send(mover, { type: "move", x: seq, z: 0, seq });
  await sync(mover);
  clock.advance(TICK);
  await sync(watcher);
  assert.equal(selfIn(deltas(watcher).at(-1), wm.id).x, 13, "three more after the refill");
  closeAll(watcher, mover);
}));

test("emotes over the rate are dropped on a fake clock too", withClock({ emoteLimit: { burst: 1, perSecond: 1 } }, async (url, clock) => {
  const { watcher, mover } = await pair(url, clock);
  const count = () => watcher.frames.filter((f) => JSON.parse(f).type === "emote").length;
  for (let i = 0; i < 5; i += 1) send(mover, { type: "emote", emote: "wave" });
  await sync(mover);
  await sync(watcher);
  assert.equal(count(), 1);
  clock.advance(1000);
  send(mover, { type: "emote", emote: "wave" });
  await sync(mover);
  await sync(watcher);
  assert.equal(count(), 2, "one more after a second");
  closeAll(watcher, mover);
}));

test("a socket that stops answering pings is evicted and others see it leave", withClock({ heartbeatMs: 1000 }, async (url, clock) => {
  const watcher = await open(url);
  const silent = await open(url, { autoPong: false });
  await join(watcher);
  const ws = await join(silent);
  clock.advance(TICK);
  await sync(watcher);

  const shut = closed(silent);
  clock.advance(1000); // first sweep: ping everyone
  await sync(watcher);
  clock.advance(1000); // second sweep: the silent socket missed its pong
  await shut;
  await settle(30);
  clock.advance(TICK);
  await sync(watcher);
  assert.equal(watcher.room.players.has(ws.id), false, "the evicted player left the room");
  assert.equal(watcher.readyState, 1, "a socket that answers pings stays");
  watcher.close();
}));

test("any frame from a client counts as alive, even without a pong", withClock({ heartbeatMs: 1000 }, async (url, clock) => {
  const quiet = await open(url, { autoPong: false });
  await join(quiet);
  for (let i = 0; i < 4; i += 1) {
    clock.advance(1000);
    await sync(quiet); // the barrier frame is client traffic
  }
  assert.equal(quiet.readyState, 1);
  quiet.close();
}));

/** Opens and joins `count` sockets that keep reading normally. */
async function joinedMany(url, count) {
  const sockets = await Promise.all(Array.from({ length: count }, () => open(url)));
  await Promise.all(sockets.map((ws) => join(ws)));
  return sockets;
}

test("a client that stops reading but keeps sending moves is dropped once its buffer passes the cap", withClock({
  heartbeatMs: 1000,
  maxBufferedBytes: 32 * 1024,
  moveLimit: { burst: 1000, perSecond: 1000 },
}, async (url, clock) => {
  const MAX_TICKS = 600;
  const [watcher, ...movers] = await joinedMany(url, 21);
  const slow = await open(url);
  const ws = await join(slow);
  clock.advance(TICK);
  await sync(watcher);
  assert.ok(watcher.room.players.has(ws.id));

  slow._socket.pause(); // stops reading; writes still go out
  let ticks = 0;
  for (; ticks < MAX_TICKS && watcher.room.players.has(ws.id); ticks += 1) {
    const seq = ticks + 1;
    movers.forEach((m, i) => send(m, { type: "move", x: (seq + i) % 20, z: 0, seq }));
    send(slow, { type: "move", x: seq % 20, z: 1, seq }); // looks alive to liveness
    await sync(movers.at(-1));
    clock.advance(TICK);
    await sync(watcher);
  }
  const stillOpen = watcher.readyState;
  [slow, watcher, ...movers].forEach((s) => s.terminate()); // before asserting: an open socket would hold the server open
  assert.equal(watcher.room.players.has(ws.id), false, `the paused reader was still in the room after ${ticks} ticks`);
  assert.equal(stillOpen, 1, "a socket that keeps reading stays");
}));
