/**
 * C3 repair: property lookups are cached briefly (hits and misses, never
 * errors), only published properties open a presence room, and the store
 * resolvers work against a real throwaway database: a stored preset reaches a
 * snapshot and a store-only prop_demo_* house is accepted as a place.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";

import { attachPresence } from "../src/presence.mjs";
import { createPlaceValidator, PROPERTY_LOOKUP_TTL_MS } from "../src/presence-places.mjs";
import { presenceStoreResolvers } from "../src/presence-resolvers.mjs";
import { presenceSessionResolver } from "../src/routes/presence.mjs";
import { createContext } from "../src/routes/context.mjs";
import { createRoutes } from "../src/routes/index.mjs";
import { createRequestHandler } from "../src/routes/dispatch.mjs";
import { applySliceFixtures, SESSIONS } from "../seed/slice-fixtures.mjs";
import { AVATARS, applyAvatars } from "../seed/fixtures/avatars.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { closeAll, join, next, open, send } from "./helpers/presenceClient.mjs";

function counting(answer) {
  const asked = [];
  return { asked, isKnownProperty: async (id) => (asked.push(id), answer(id)) };
}

test("a property lookup is cached for a short while, hits and misses alike", async () => {
  let t = 0;
  const store = counting((id) => id === "prop_extra");
  const validate = createPlaceValidator({ ...store, now: () => t });
  assert.equal(await validate("prop_extra"), "prop_extra");
  assert.equal(await validate("prop_extra"), "prop_extra");
  assert.equal(await validate("prop_ghost"), null);
  assert.equal(await validate("prop_ghost"), null);
  assert.deepEqual(store.asked, ["prop_extra", "prop_ghost"]);
  t += PROPERTY_LOOKUP_TTL_MS + 1;
  await validate("prop_extra");
  assert.deepEqual(store.asked, ["prop_extra", "prop_ghost", "prop_extra"], "expired entries are looked up again");
});

test("a failed lookup is never cached", async () => {
  let fail = true;
  const asked = [];
  const validate = createPlaceValidator({
    now: () => 0,
    isKnownProperty: async (id) => {
      asked.push(id);
      if (fail) throw new Error("down");
      return true;
    },
  });
  assert.equal(await validate("prop_extra"), null);
  fail = false;
  assert.equal(await validate("prop_extra"), "prop_extra");
  assert.equal(asked.length, 2);
});

test("only a published property opens a presence room", async () => {
  const rows = { prop_live: { id: "prop_live", published: true }, prop_draft: { id: "prop_draft", published: false } };
  const { isKnownProperty } = presenceStoreResolvers({ db: { store: { getProperty: async (id) => rows[id] ?? null } } });
  assert.equal(await isKnownProperty("prop_live"), true);
  assert.equal(await isKnownProperty("prop_draft"), false);
  assert.equal(await isKnownProperty("prop_none"), false);
});

const withDb = { skip: pgAvailable() ? false : "Postgres not reachable at PGHOST" };

test("through the real routes context, a stored preset reaches the snapshot and a store-only house is a place", withDb, async () => {
  const db = createThrowawayDb({ prefix: "nervix_world_presence_store" });
  const ctx = createContext({ env: { DATABASE_URL: db.url } });
  const server = http.createServer(createRequestHandler(createRoutes(ctx)));
  try {
    const pool = new pg.Pool({ connectionString: db.url });
    try {
      await applySliceFixtures(pool);
      await applyAvatars((sql, params) => pool.query(sql, params)); // not part of the slice fixtures yet
    } finally {
      await pool.end();
    }
    attachPresence(server, { onError: () => {}, resolveSession: presenceSessionResolver(ctx), ...presenceStoreResolvers(ctx) });
    const port = await pickTestPort(2);
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    const url = `ws://127.0.0.1:${port}/presence`;

    const member = await open(url, { cookie: SESSIONS.dangg });
    try {
      const welcome = await join(member);
      assert.equal(welcome.players[0].preset, AVATARS.usr_dangg, "the stored preset, not the hash default");
      const reply = Promise.race([next(member, "players"), next(member, "error")]);
      send(member, { type: "place", place: "prop_demo_lantern" });
      const frame = await reply;
      assert.deepEqual([frame.type, frame.place], ["players", "prop_demo_lantern"], JSON.stringify(frame));
    } finally {
      closeAll(member);
    }
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await ctx.db.store.close();
    db.drop();
  }
});
