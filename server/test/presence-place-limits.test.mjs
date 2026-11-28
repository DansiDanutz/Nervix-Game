/**
 * C3 repair: place changes and repeat joins are rate-limited per socket on a
 * fake clock, and the per-socket work queue is capped. A place frame over the
 * limit never reaches the place validator (no store lookup, no snapshot); the
 * player is parked instead, so the client never shows a frozen ghost.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { attachPresence } from "../src/presence.mjs";
import { DEFAULT_TICK_MS } from "../src/presence-transport.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";
import { closed, join, open, send, sync, withPresence } from "./helpers/presenceClient.mjs";

const TICK = DEFAULT_TICK_MS;
const framesOf = (ws, type) => ws.frames.map((f) => JSON.parse(f)).filter((f) => f.type === type);
const CLOSE_POLICY_VIOLATION = 1008;
const lookups = [];

function withClock(options, fn) {
  const clock = createFakeClock();
  return withPresence(attachPresence, { tickMs: TICK, clock, ...options }, (url) => fn(url, clock));
}

test("place changes over the rate are refused before validation, and the bucket refills", withClock({
  placeLimit: { burst: 2, perSecond: 1 },
  isKnownProperty: async (id) => (lookups.push(id), id === "prop_extra"),
}, async (url, clock) => {
  const ws = await open(url);
  await join(ws);
  lookups.length = 0;
  const places = ["openpoker", "prop_extra", "plaza", "prop_extra", "openpoker"];
  for (const place of places) send(ws, { type: "place", place });
  await sync(ws);
  assert.equal(framesOf(ws, "players").length, 2, "only the burst of 2 got a room snapshot");
  assert.deepEqual(lookups, ["prop_extra"], "frames over the limit never reached the store");
  const limited = framesOf(ws, "error").filter((f) => f.message === "rate limited");
  assert.deepEqual(limited.map((f) => f.place), ["plaza", "prop_extra", "openpoker"]);

  clock.advance(1000);
  send(ws, { type: "place", place: "plaza" });
  await sync(ws);
  assert.equal(framesOf(ws, "players").length, 3, "one more after a second of refill");
  ws.close();
}));

test("a repeat join after joining is dropped without any work", withClock({}, async (url) => {
  const ws = await open(url);
  await join(ws);
  for (let i = 0; i < 50; i += 1) send(ws, { type: "join", place: "openpoker" });
  await sync(ws);
  assert.equal(framesOf(ws, "welcome").length, 1);
  assert.equal(framesOf(ws, "players").length, 0);
  ws.close();
}));

test("a socket whose queue backs up behind a slow store is closed", withClock({
  placeLimit: { burst: 1000, perSecond: 1000 },
  maxQueue: 4,
  isKnownProperty: () => new Promise(() => {}), // the store never answers
}, async (url) => {
  const ws = await open(url);
  await join(ws);
  const code = closed(ws);
  for (let i = 0; i < 20; i += 1) send(ws, { type: "place", place: `prop_slow${i}` });
  assert.equal(await code, CLOSE_POLICY_VIOLATION);
}));

