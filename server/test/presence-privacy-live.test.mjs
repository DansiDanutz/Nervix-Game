/**
 * C9 review fix: a privacy change applies to a connected player, without a
 * reconnect. The shown name and preset are rebuilt on every session recheck,
 * and at once when the route calls `refreshUser(userId)` on the presence
 * server after a successful PUT /me/privacy.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { attachPresence } from "../src/presence.mjs";
import { ANON_NAME } from "../src/presence-privacy.mjs";
import { defaultPreset } from "../src/presence-places.mjs";
import { closeAll, join, next, nextRoom, open, selfIn, send, withPresence } from "./helpers/presenceClient.mjs";

const USERS = Object.freeze({
  watcher: Object.freeze({ id: "usr_watch", displayName: "Watcher Wim" }),
  hana: Object.freeze({ id: "usr_hana", displayName: "Hana Hill" }),
});
const SAVED_PRESET = "linen";
const cookieOf = (req) => /nervix_session=(\w+)/.exec(req.headers.cookie ?? "")?.[1];

/** A settings store the test flips while the socket stays open. */
function liveSettings() {
  let rows = {};
  return {
    set: (userId, row) => { rows = { ...rows, [userId]: Object.freeze(row) }; },
    options: Object.freeze({
      resolveSession: async (req) => USERS[cookieOf(req)] ?? null,
      resolvePreset: async () => SAVED_PRESET,
      resolvePrivacy: async (userId) => rows[userId] ?? null,
    }),
  };
}

/** The watcher and Hana joined; Hana is seen under her real name first. */
async function joinedPair(url) {
  const watcher = await open(url, { cookie: "watcher" });
  await join(watcher);
  const hana = await open(url, { cookie: "hana" });
  const seen = nextRoom(watcher, (v) => v.players.length === 2);
  const wh = await join(hana);
  assert.equal(selfIn(await seen, wh.id).name, "Hana Hill");
  return { watcher, hana, id: wh.id };
}

test("turning on hide-name while connected hides the name at the next session recheck, in deltas and chat", async () => {
  const settings = liveSettings();
  await withPresence(attachPresence, { ...settings.options, sessionRecheckMs: 40 }, async (url) => {
    const { watcher, hana, id } = await joinedPair(url);
    const hidden = nextRoom(watcher, (v) => selfIn(v, id)?.name === ANON_NAME);
    settings.set("usr_hana", { hideName: true, anonymous: false });
    assert.equal(selfIn(await hidden, id).preset, SAVED_PRESET, "hide-name alone keeps the appearance");
    const hiddenAt = watcher.frames.length - 1;
    const heard = next(watcher, "say");
    send(hana, { type: "say", text: "still here" });
    assert.equal((await heard).name, ANON_NAME);
    assert.doesNotMatch(watcher.frames.slice(hiddenAt).join("\n"), /Hana Hill/, "no frame after the change carries the name");
    closeAll(watcher, hana);
  })();
});

test("going anonymous while connected also swaps the saved preset for the handle-derived one", async () => {
  const settings = liveSettings();
  await withPresence(attachPresence, { ...settings.options, sessionRecheckMs: 40 }, async (url) => {
    const { watcher, hana, id } = await joinedPair(url);
    const anon = nextRoom(watcher, (v) => selfIn(v, id)?.name === ANON_NAME);
    settings.set("usr_hana", { hideName: false, anonymous: true });
    assert.equal(selfIn(await anon, id).preset, defaultPreset(id));
    closeAll(watcher, hana);
  })();
});

test("refreshUser applies a saved change at once, with no recheck timer", async () => {
  const settings = liveSettings();
  let wss = null;
  const attach = (server, options) => (wss = attachPresence(server, options));
  await withPresence(attach, { ...settings.options, sessionRecheckMs: 0 }, async (url) => {
    const { watcher, hana, id } = await joinedPair(url);
    const hidden = nextRoom(watcher, (v) => selfIn(v, id)?.name === ANON_NAME);
    settings.set("usr_hana", { hideName: true, anonymous: false });
    await wss.refreshUser("usr_hana");
    await hidden;
    await wss.refreshUser("usr_nobody"); // unknown users are a no-op
    closeAll(watcher, hana);
  })();
});
