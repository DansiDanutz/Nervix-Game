/**
 * C3 place-scoped presence rooms. Join and place changes carry a place id that
 * the server validates against shared/contracts/place-ids.json and the known
 * properties (prop_* from the store). Each place is its own room with its own
 * bounds and capacity. Moves carry yaw and a sequence number. The snapshot
 * carries the avatar preset id (C5 handover), validated against
 * shared/contracts/avatar-presets.json.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";

import { attachPresence } from "../src/presence.mjs";
import { closeAll, has, join, next, nextRoom, open, selfIn, send, settle, sync, withPresence as withPresenceOn } from "./helpers/presenceClient.mjs";

const contract = (name) => JSON.parse(readFileSync(new URL(`../../shared/contracts/${name}.json`, import.meta.url), "utf8"));
const PRESET_IDS = contract("avatar-presets").presets.map((p) => p.id);
const DANGG = Object.freeze({ id: "usr_dangg", displayName: "DanGG" });
const DANGG_COOKIE = "sess_unit_dangg";

const fakeResolver = async (req) => ((req.headers.cookie ?? "").includes(DANGG_COOKIE) ? DANGG : null);

const withPresence = (options, fn) => withPresenceOn(attachPresence, options, fn);
const parsed = (ws) => ws.frames.map((f) => JSON.parse(f));
const roomFrames = (ws) => parsed(ws).filter((f) => f.players);

/** Sends a place change and waits for the mover's own room snapshot. */
async function changePlace(ws, place) {
  const snapshot = next(ws, "players", (m) => m.place === place);
  send(ws, { type: "place", place });
  return snapshot;
}

const ids = (snapshot) => snapshot.players.map((p) => p.id).sort();

test("a join without a place lands on the plaza", withPresence({}, async (url) => {
  const ws = await open(url);
  const w = await join(ws);
  assert.equal(w.place, "plaza");
  assert.equal(w.players[0].place, "plaza");
  ws.close();
}));

test("a join into a contract place lands in that room only", withPresence({}, async (url) => {
  const plaza = await open(url);
  const wp = await join(plaza);
  const venue = await open(url);
  const wv = await join(venue, { place: "openpoker" });
  assert.equal(wv.place, "openpoker");
  assert.deepEqual(ids(wv), [wv.id], "the venue room does not list plaza players");
  await settle();
  for (const frame of roomFrames(plaza)) {
    assert.deepEqual(frame.players.map((p) => p.id), [wp.id], "the plaza never sees the venue player");
  }
  closeAll(plaza, venue);
}));

test("an unknown place is rejected on join and the socket may retry", withPresence({}, async (url) => {
  const watcher = await open(url);
  const ww = await join(watcher);
  const ws = await open(url);
  for (const place of ["house:bld_dangg", "prop_nope", "usr_dangg", "", 42, null]) {
    const error = next(ws, "error");
    send(ws, { type: "join", place });
    assert.equal((await error).message, "unknown place", JSON.stringify(place));
  }
  await settle();
  for (const frame of roomFrames(watcher)) {
    assert.deepEqual(frame.players.map((p) => p.id), [ww.id], "no rejected join reached the room");
  }
  const w = await join(ws, { place: "plaza" });
  assert.equal(w.players.length, 2);
  closeAll(watcher, ws);
}));

test("a prop_ id outside the contract is accepted only when the store knows it", withPresence({
  isKnownProperty: async (id) => id === "prop_newshop",
}, async (url) => {
  const ws = await open(url);
  const w = await join(ws, { place: "prop_newshop" });
  assert.equal(w.place, "prop_newshop");
  const error = next(ws, "error");
  send(ws, { type: "place", place: "prop_ghost" });
  assert.equal((await error).message, "unknown place");
  ws.close();
}));

test("a failing property lookup rejects the place instead of admitting it", withPresence({
  isKnownProperty: async () => {
    throw new Error("store down");
  },
}, async (url) => {
  const ws = await open(url);
  const error = next(ws, "error");
  send(ws, { type: "join", place: "prop_newshop" });
  assert.equal((await error).message, "unknown place");
  ws.close();
}));

test("a player in house prop_dangg is absent from plaza snapshots", withPresence({ resolveSession: fakeResolver }, async (url) => {
  const a = await open(url, { cookie: DANGG_COOKIE });
  const b = await open(url);
  const wa = await join(a);
  const wb = await join(b);
  assert.deepEqual(ids(wb), [wa.id, wb.id].sort());

  await nextRoom(b, (v) => has(v, wa.id));
  const plazaUpdate = nextRoom(b, (v) => !has(v, wa.id));
  const mine = await changePlace(a, "prop_dangg");
  assert.deepEqual(ids(mine), [wa.id], "the mover sees only the house room");
  assert.deepEqual(ids(await plazaUpdate), [wb.id], "the plaza loses the player who went inside");

  await settle();
  const before = b.frames.length;
  send(a, { type: "move", x: 1, z: 1, yaw: 0.5, seq: 1 });
  send(a, { type: "emote", emote: "wave" });
  await settle();
  assert.equal(b.frames.length, before, "house moves and emotes never reach the plaza");

  const seen = nextRoom(b, (v) => selfIn(v, wb.id)?.x === 2);
  send(b, { type: "move", x: 2, z: 2, seq: 1 });
  assert.deepEqual(ids(await seen), [wb.id]);

  const back = nextRoom(b, (v) => v.players.length === 2);
  await changePlace(a, "plaza");
  assert.deepEqual(ids(await back), [wa.id, wb.id].sort(), "back on the plaza, A is visible again");
  closeAll(a, b);
}));

test("a place change to an unknown place is rejected and the player leaves the old room (fail closed)", withPresence({}, async (url) => {
  const ws = await open(url);
  const watcher = await open(url);
  const w = await join(ws, { place: "openpoker" });
  await join(watcher, { place: "openpoker" });
  const gone = nextRoom(watcher, (v) => !has(v, w.id));
  const error = next(ws, "error");
  send(ws, { type: "place", place: "casino-vault" });
  assert.equal((await error).message, "unknown place");
  await gone;
  closeAll(ws, watcher);
}));

test("moves are clamped to the bounds of the player's own place", withPresence({}, async (url) => {
  const ws = await open(url);
  const { id } = await join(ws);
  // Every room starts the player at x = 0, so the first frame with x != 0 carries the clamped move.
  const moveTo = async (x, z, seq) => {
    const moved = nextRoom(ws, (v) => (selfIn(v, id)?.x ?? 0) !== 0);
    send(ws, { type: "move", x, z, seq });
    return selfIn(await moved, id);
  };
  let self = await moveTo(-500, 500, 1);
  assert.deepEqual([self.x, self.z], [-42, 40], "plaza bounds");

  await changePlace(ws, "prop_dangg");
  self = await moveTo(50, -50, 2);
  assert.deepEqual([self.x, self.z], [5.6, -4.2], "house room bounds");

  await changePlace(ws, "openpoker");
  self = await moveTo(-50, -50, 3);
  assert.deepEqual([self.x, self.z], [-6.9, -8.9], "salon bounds");
  ws.close();
}));

test("moves carry yaw, normalised to (-pi, pi]", withPresence({}, async (url) => {
  const ws = await open(url);
  const { id } = await join(ws);
  const steps = [[1.25, 1.25], [Math.PI * 2 + 0.5, 0.5], ["spin", 0.5], [-Math.PI, Math.PI]];
  let seq = 0;
  for (const [yaw, want] of steps) {
    seq += 1;
    const moved = nextRoom(ws, (v) => selfIn(v, id)?.x === seq);
    send(ws, { type: "move", x: seq, z: 0, yaw, seq });
    assert.ok(Math.abs(selfIn(await moved, id).yaw - want) < 1e-9, `yaw ${yaw} -> ${want}`);
  }
  ws.close();
}));

test("a stale or repeated sequence number is dropped", withPresence({}, async (url) => {
  const watcher = await open(url);
  await join(watcher);
  const ws = await open(url);
  const w = await join(ws);
  const seenAt = (x) => nextRoom(watcher, (v) => selfIn(v, w.id)?.x === x); // C9: seq is no longer broadcast
  let seen = seenAt(5);
  send(ws, { type: "move", x: 5, z: 0, seq: 5 });
  await seen;
  seen = seenAt(6);
  send(ws, { type: "move", x: 4, z: 0, seq: 4 });
  send(ws, { type: "move", x: 4, z: 0, seq: 5 });
  send(ws, { type: "move", x: 6, z: 0, seq: 6 });
  await seen;
  send(ws, { type: "move", x: 7, z: 0, seq: -1 });
  send(ws, { type: "move", x: 7, z: 0, seq: 1.5 });
  await sync(ws);
  await settle();
  const states = roomFrames(watcher).flatMap((f) => f.players.filter((p) => p.id === w.id)).map((p) => p.x);
  assert.deepEqual(states.filter((x) => x > 0), [5, 6], "dropped moves never reach the room");
  closeAll(watcher, ws);
}));

test("a move stamped for another place is dropped", withPresence({}, async (url) => {
  const ws = await open(url);
  await join(ws);
  await changePlace(ws, "openpoker");
  await settle();
  const before = ws.frames.length;
  send(ws, { type: "move", x: 3, z: 3, seq: 1, place: "plaza" });
  await settle();
  assert.equal(ws.frames.length, before, "a late plaza move does not move the player in the salon");
  ws.close();
}));

test("capacity is per room", withPresence({ roomCapacity: 1 }, async (url) => {
  const a = await open(url);
  await join(a);
  const b = await open(url);
  const error = next(b, "error");
  send(b, { type: "join" });
  assert.equal((await error).message, "room full");
  const wb = await join(b, { place: "openpoker" });
  assert.equal(wb.place, "openpoker");
  const full = next(b, "error");
  send(b, { type: "place", place: "plaza" });
  assert.equal((await full).message, "room full");
  closeAll(a, b);
}));

test("concurrent joins never push a room past its capacity while the preset lookup is slow", withPresence({
  roomCapacity: 2,
  resolveSession: async () => DANGG,
  resolvePreset: () => new Promise((resolve) => setTimeout(() => resolve(null), 50)),
}, async (url) => {
  const sockets = await Promise.all(Array.from({ length: 6 }, () => open(url)));
  const replies = sockets.map((ws) => new Promise((resolve) => {
    ws.on("message", (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame.type === "welcome" || frame.type === "error") resolve(frame.type);
    });
  }));
  sockets.forEach((ws) => send(ws, { type: "join" }));
  const outcomes = await Promise.all(replies);
  sockets.forEach((ws) => ws.terminate()); // before asserting: an open socket would hold the server open
  assert.equal(outcomes.filter((t) => t === "welcome").length, 2, `outcomes: ${outcomes.join(",")}`);
  assert.equal(outcomes.filter((t) => t === "error").length, 4);
}));

test("the snapshot carries the stored avatar preset", withPresence({
  resolveSession: fakeResolver,
  resolvePreset: async (userId) => (userId === DANGG.id ? "terracotta" : null),
}, async (url) => {
  const ws = await open(url, { cookie: DANGG_COOKIE });
  const w = await join(ws);
  assert.equal(w.players[0].preset, "terracotta");
  ws.close();
}));

test("an invalid or missing stored preset falls back to a deterministic contract preset", async () => {
  const presetsFor = async (resolvePreset) => {
    const seen = [];
    await withPresence({ resolveSession: fakeResolver, resolvePreset }, async (url) => {
      for (let i = 0; i < 2; i += 1) {
        const ws = await open(url, { cookie: DANGG_COOKIE });
        seen.push((await join(ws)).players.find((p) => p.name === "DanGG").preset);
        ws.close();
        await settle(30);
      }
    })();
    return seen;
  };
  const invalid = await presetsFor(async () => "neon-<script>");
  const failing = await presetsFor(async () => {
    throw new Error("store down");
  });
  const none = await presetsFor(undefined);
  for (const preset of [...invalid, ...failing, ...none]) assert.ok(PRESET_IDS.includes(preset), preset);
  assert.equal(new Set([...invalid, ...failing, ...none]).size, 1, "the same user always gets the same default");
});

test("guests get a contract preset too", withPresence({}, async (url) => {
  const ws = await open(url);
  const w = await join(ws);
  assert.ok(PRESET_IDS.includes(w.players[0].preset));
  ws.close();
}));

test("the public player view exposes only public fields", withPresence({ resolveSession: fakeResolver }, async (url) => {
  const ws = await open(url, { cookie: DANGG_COOKIE });
  const w = await join(ws);
  assert.deepEqual(Object.keys(w.players[0]).sort(), ["id", "name", "place", "preset", "x", "yaw", "z"]);
  assert.doesNotMatch(JSON.stringify(w), /usr_|demo_/);
  ws.close();
}));
