/**
 * C9 over a real presence socket: a hidden-name user broadcasts as anonymous,
 * an anonymous user also drops their saved appearance, a failed settings
 * lookup fails closed, a disallowed stored name is never broadcast, and every
 * room frame carries exactly the public field set.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { attachPresence, GUEST_NAME } from "../src/presence.mjs";
import { ANON_NAME, PUBLIC_FIELDS } from "../src/presence-privacy.mjs";
import { defaultPreset } from "../src/presence-places.mjs";
import { closeAll, join, next, nextRoom, open, selfIn, send, settle, withPresence } from "./helpers/presenceClient.mjs";

const USERS = Object.freeze({
  shown: Object.freeze({ id: "usr_shown", displayName: "Shown Sam" }),
  hidden: Object.freeze({ id: "usr_hidden", displayName: "Hidden Hana" }),
  anon: Object.freeze({ id: "usr_anon", displayName: "Anon Ari" }),
  rude: Object.freeze({ id: "usr_rude", displayName: "Sh1t Lord" }),
  broken: Object.freeze({ id: "usr_broken", displayName: "Broken Bo" }),
});
const SETTINGS = Object.freeze({
  usr_shown: null,
  usr_hidden: Object.freeze({ hideName: true, anonymous: false }),
  usr_anon: Object.freeze({ hideName: false, anonymous: true }),
  usr_rude: null,
});
const SAVED_PRESET = "linen";

const cookieOf = (req) => /nervix_session=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
const options = Object.freeze({
  resolveSession: async (req) => USERS[cookieOf(req)] ?? null,
  resolvePreset: async () => SAVED_PRESET,
  resolvePrivacy: async (userId) => {
    if (userId === "usr_broken") throw new Error("settings store down");
    return SETTINGS[userId] ?? null;
  },
});

const sortedKeys = (o) => Object.keys(o).sort();
const PUBLIC = [...PUBLIC_FIELDS].sort();

test("a hidden-name user broadcasts as anonymous, in snapshots, deltas and chat", withPresence(attachPresence, options, async (url) => {
  const watcher = await open(url, { cookie: "shown" });
  await join(watcher);
  const hidden = await open(url, { cookie: "hidden" });
  const seen = nextRoom(watcher, (v) => v.players.length === 2);
  const wh = await join(hidden);
  const room = await seen;
  assert.equal(selfIn(room, wh.id).name, ANON_NAME);
  assert.equal(selfIn(room, wh.id).preset, SAVED_PRESET, "hide-name alone keeps the saved appearance");
  const heard = next(watcher, "say");
  send(hidden, { type: "say", text: "hello" });
  assert.equal((await heard).name, ANON_NAME);
  assert.doesNotMatch(watcher.frames.join("\n"), /Hidden Hana|usr_hidden/);
  closeAll(watcher, hidden);
}));

test("an anonymous user also loses the saved appearance, so two visits cannot be linked by it", withPresence(attachPresence, options, async (url) => {
  const a = await open(url, { cookie: "anon" });
  const wa = await join(a);
  const self = selfIn(wa, wa.id);
  assert.equal(self.name, ANON_NAME);
  assert.equal(self.preset, defaultPreset(wa.id), "the preset is derived from the per-connection handle");
  closeAll(a);
}));

test("a failed settings lookup fails closed to anonymous", withPresence(attachPresence, options, async (url) => {
  const a = await open(url, { cookie: "broken" });
  const wa = await join(a);
  assert.equal(selfIn(wa, wa.id).name, ANON_NAME);
  closeAll(a);
}));

test("a stored name that breaks the display-name policy is never broadcast", withPresence(attachPresence, options, async (url) => {
  const a = await open(url, { cookie: "rude" });
  const wa = await join(a);
  assert.equal(selfIn(wa, wa.id).name, ANON_NAME);
  assert.doesNotMatch(a.frames.join("\n"), /Sh1t/);
  closeAll(a);
}));

test("names stay visible by default and guests stay guests", withPresence(attachPresence, options, async (url) => {
  const a = await open(url, { cookie: "shown" });
  const g = await open(url);
  const wa = await join(a);
  const wg = await join(g);
  assert.equal(selfIn(wa, wa.id).name, "Shown Sam");
  assert.equal(selfIn(wg, wg.id).name, GUEST_NAME);
  closeAll(a, g);
}));

test("welcome, players and delta frames carry exactly the public field set", withPresence(attachPresence, options, async (url) => {
  const watcher = await open(url, { cookie: "shown" });
  const mover = await open(url, { cookie: "hidden" });
  await join(watcher, { district: "central-plaza" });
  const wm = await join(mover, { district: "merchant-quarter" });
  send(mover, { type: "move", x: 3, z: 4, yaw: 0.5, seq: 1, district: "merchant-quarter" });
  await nextRoom(watcher, (v) => selfIn(v, wm.id)?.x === 3);
  send(mover, { type: "place", place: "openpoker" });
  await next(mover, "players");
  await settle(60);
  const frames = [...watcher.frames, ...mover.frames].map((raw) => JSON.parse(raw));
  const views = frames.filter((f) => ["welcome", "players", "delta"].includes(f.type)).flatMap((f) => f.players);
  assert.ok(views.length >= 4, `saw ${views.length} player views`);
  for (const view of views) assert.deepEqual(sortedKeys(view), PUBLIC, JSON.stringify(view));
  closeAll(watcher, mover);
}));
