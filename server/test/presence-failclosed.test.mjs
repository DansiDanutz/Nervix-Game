/**
 * C3 repair: a refused place change fails closed. The player leaves the old
 * room (others get them in `left`) and is parked in no room until a valid
 * place frame arrives. The error names the place that was refused, so the
 * client can show an empty room instead of a frozen ghost staying behind.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { attachPresence } from "../src/presence.mjs";
import { closeAll, has, join, next, nextRoom, open, selfIn, send, settle, sync, withPresence as withPresenceOn } from "./helpers/presenceClient.mjs";

const withPresence = (options, fn) => withPresenceOn(attachPresence, options, fn);
const roomFramesAfter = (ws, from) => ws.frames.slice(from).map((f) => JSON.parse(f)).filter((f) => f.players);

/** A on the plaza at (5,5), watched by B. */
async function plazaPair(url) {
  const a = await open(url);
  const b = await open(url);
  const wa = await join(a);
  const wb = await join(b);
  const seen = nextRoom(b, (v) => selfIn(v, wa.id)?.x === 5);
  send(a, { type: "move", x: 5, z: 5, seq: 1 });
  await seen;
  return { a, b, wa, wb };
}

test("a refused place change takes the player out of the old room", withPresence({}, async (url) => {
  const { a, b, wa } = await plazaPair(url);
  const gone = nextRoom(b, (v) => !has(v, wa.id));
  const error = next(a, "error");
  send(a, { type: "place", place: "prop_demo_lantern" });
  const refusal = await error;
  assert.equal(refusal.message, "unknown place");
  assert.equal(refusal.place, "prop_demo_lantern", "the error names the refused place");
  await gone;

  const mark = b.frames.length;
  send(a, { type: "move", x: 7, z: 7, seq: 2, place: "prop_demo_lantern" });
  send(a, { type: "move", x: 8, z: 8, seq: 3 });
  send(a, { type: "emote", emote: "wave" });
  await settle();
  assert.equal(b.frames.length, mark, "a parked player reaches no room");
  closeAll(a, b);
}));

test("a parked player can change to a valid place and is seen again", withPresence({}, async (url) => {
  const { a, b, wa } = await plazaPair(url);
  const gone = nextRoom(b, (v) => !has(v, wa.id));
  send(a, { type: "place", place: "prop_ghost" });
  await gone;
  const back = nextRoom(b, (v) => has(v, wa.id));
  const mine = next(a, "players", (m) => m.place === "plaza");
  send(a, { type: "place", place: "plaza" });
  assert.equal((await mine).players.length, 2);
  assert.ok(has(await back, wa.id));
  closeAll(a, b);
}));

test("a place change into a full room also fails closed", withPresence({ roomCapacity: 1 }, async (url) => {
  const venue = await open(url);
  await join(venue, { place: "openpoker" });
  const a = await open(url);
  await join(a);
  const error = next(a, "error");
  send(a, { type: "place", place: "openpoker" });
  const refusal = await error;
  assert.deepEqual([refusal.message, refusal.place], ["room full", "openpoker"]);
  const b = await open(url);
  const wb = await join(b);
  assert.deepEqual(wb.players.map((p) => p.id), [wb.id], "A no longer holds the plaza slot");
  closeAll(venue, a, b);
}));

test("place null leaves the room quietly, without an error", withPresence({}, async (url) => {
  const { a, b, wa } = await plazaPair(url);
  const gone = nextRoom(b, (v) => !has(v, wa.id));
  send(a, { type: "place", place: null });
  await gone;
  await sync(a);
  const errors = a.frames.map((f) => JSON.parse(f)).filter((f) => f.type === "error" && f.message !== "invalid message");
  assert.deepEqual(errors, []);
  closeAll(a, b);
}));

test("a refused join names the place too, and nothing reaches any room", withPresence({}, async (url) => {
  const watcher = await open(url);
  await join(watcher);
  await settle(); // the watcher's own join delta
  const mark = watcher.frames.length;
  const ws = await open(url);
  const error = next(ws, "error");
  send(ws, { type: "join", place: "prop_nope" });
  assert.deepEqual([(await error).message, (await error).place], ["unknown place", "prop_nope"]);
  await settle();
  assert.deepEqual(roomFramesAfter(watcher, mark), []);
  closeAll(watcher, ws);
}));

test("the refused place is echoed only when it is place-shaped", withPresence({}, async (url) => {
  const ws = await open(url);
  await join(ws);
  for (const place of ["usr_dangg", "house:bld_dangg", 42, `prop_${"x".repeat(80)}`]) {
    const error = next(ws, "error", (m) => m.message === "unknown place");
    send(ws, { type: "place", place });
    assert.equal((await error).place, null, JSON.stringify(place));
  }
  ws.close();
}));
