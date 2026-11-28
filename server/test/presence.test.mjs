/**
 * S4 session-bound presence identity. The server, never the client, sets the
 * presence id and display name: a session cookie read on the WebSocket upgrade
 * gives the session user's name, everyone else is a guest. Every connection
 * gets an opaque server-made handle, and no broadcast frame carries a user id.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";
import WebSocket from "ws";

import { attachPresence, GUEST_NAME, HANDLE_PATTERN } from "../src/presence.mjs";
import { presenceSessionResolver } from "../src/routes/presence.mjs";
import { createContext } from "../src/routes/context.mjs";
import { createRoutes } from "../src/routes/index.mjs";
import { createRequestHandler } from "../src/routes/dispatch.mjs";
import { applySliceFixtures, SESSIONS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { closeAll, closed, has, join, next, nextRoom, open, selfIn, settle, withPresence as withPresenceOn } from "./helpers/presenceClient.mjs";

const USER_ID = /usr_|demo_/;
const FIXTURE_COOKIE = "sess_unit_dangg";
const FIXTURE_USER = Object.freeze({ id: "usr_dangg", displayName: "DanGG" });

/** Unit resolver: one known session token, everything else is a guest. */
async function fakeResolver(req) {
  return (req.headers.cookie ?? "").includes(`nervix_session=${FIXTURE_COOKIE}`) ? FIXTURE_USER : null;
}

const withPresence = (options, fn) => withPresenceOn(attachPresence, options, fn);

test("two players see each other and a leaving player disappears", withPresence({ resolveSession: fakeResolver }, async (url) => {
  const a = await open(url);
  const b = await open(url);
  const wa = await join(a, { district: "central-plaza" });
  assert.equal(wa.players.length, 1);
  const wb = await join(b);
  assert.equal(wb.players.length, 2, "the newcomer sees both players");

  const moved = nextRoom(a, (v) => selfIn(v, wb.id)?.x === 3);
  b.send(JSON.stringify({ type: "move", x: 3, z: 4 }));
  const bo = selfIn(await moved, wb.id);
  assert.equal(bo.x, 3);
  assert.equal(bo.z, 4);

  const removed = nextRoom(a, (v) => !has(v, wb.id));
  b.close();
  const after = await removed;
  assert.deepEqual(after.players.map((p) => p.id), [wa.id]);
  a.close();
}));

test("messages before join are ignored", withPresence({}, async (url) => {
  const a = await open(url);
  a.send(JSON.stringify({ type: "move", x: 1, z: 1 }));
  const w = await join(a);
  assert.equal(w.players.length, 1);
  assert.equal(w.players[0].x, 0, "the ignored move did not apply");
  a.close();
}));

test("a join claiming usr_dangg gets a server handle and the guest name", withPresence({ resolveSession: fakeResolver }, async (url) => {
  const ws = await open(url);
  const w = await join(ws, { userId: "usr_dangg", name: "DanGG", id: "usr_dangg" });
  assert.match(w.id, HANDLE_PATTERN);
  assert.notEqual(w.id, "usr_dangg");
  assert.equal(w.players[0].id, w.id);
  assert.equal(w.players[0].name, GUEST_NAME, "a claimed name is ignored without a session");
  ws.close();
}));

test("a session cookie on the upgrade gives the session display name, not the id", withPresence({ resolveSession: fakeResolver }, async (url) => {
  const ws = await open(url, { cookie: FIXTURE_COOKIE });
  const w = await join(ws, { name: "Somebody Else" });
  assert.equal(w.players[0].name, "DanGG");
  assert.match(w.id, HANDLE_PATTERN);
  assert.doesNotMatch(JSON.stringify(w), USER_ID);
  ws.close();
}));

test("two guests get two distinct handles", withPresence({}, async (url) => {
  const a = await open(url);
  const b = await open(url);
  const wa = await join(a, { userId: "guest" });
  const wb = await join(b, { userId: "guest" });
  assert.notEqual(wa.id, wb.id);
  assert.match(wa.id, HANDLE_PATTERN);
  assert.match(wb.id, HANDLE_PATTERN);
  assert.equal(new Set(wb.players.map((p) => p.id)).size, 2);
  closeAll(a, b);
}));

test("the same session in two tabs gets two handles", withPresence({ resolveSession: fakeResolver }, async (url) => {
  const a = await open(url, { cookie: FIXTURE_COOKIE });
  const b = await open(url, { cookie: FIXTURE_COOKIE });
  const wa = await join(a);
  const wb = await join(b);
  assert.notEqual(wa.id, wb.id);
  closeAll(a, b);
}));

test("no frame sent to anyone contains a usr_ or demo_ id", withPresence({ resolveSession: fakeResolver }, async (url) => {
  const watcher = await open(url);
  await join(watcher);
  const member = await open(url, { cookie: FIXTURE_COOKIE });
  const wm = await join(member, { userId: "usr_dangg", district: "usr_dangg" });
  const guest = await open(url);
  const wg = await join(guest, { userId: "demo_abc123", name: "demo_abc123", district: "demo_abc123" });

  for (const [ws, id] of [[member, wm.id], [guest, wg.id]]) {
    const seen = nextRoom(watcher, (v) => selfIn(v, id)?.x === 2);
    ws.send(JSON.stringify({ type: "move", x: 2, z: 2, district: "usr_dangg" }));
    await seen;
  }
  const emoted = next(watcher, "emote");
  guest.send(JSON.stringify({ type: "emote", emote: "usr_dangg" }));
  const emote = await emoted;
  assert.match(emote.id, HANDLE_PATTERN);

  const left = nextRoom(watcher, (v) => !has(v, wm.id));
  member.close();
  await left;

  const frames = [...watcher.frames, ...guest.frames];
  assert.ok(frames.length >= 6, `observed ${frames.length} frames`);
  for (const frame of frames) assert.doesNotMatch(frame, USER_ID, frame);
  closeAll(watcher, guest);
}));

test("a client-sent district must be a plain slug", withPresence({}, async (url) => {
  const ws = await open(url);
  const w = await join(ws, { district: "Bad District!" });
  assert.equal(w.players[0].district, "central-plaza");
  const moved = nextRoom(ws, (v) => selfIn(v, w.id)?.x === 1);
  ws.send(JSON.stringify({ type: "move", x: 1, z: 1, district: "merchant-quarter" }));
  assert.equal(selfIn(await moved, w.id).district, "merchant-quarter");
  ws.close();
}));

test("a failing session lookup admits the player as a guest", withPresence({
  resolveSession: async () => {
    throw new Error("store down");
  },
  onError: () => {},
}, async (url) => {
  const ws = await open(url, { cookie: FIXTURE_COOKIE });
  const w = await join(ws);
  assert.equal(w.players[0].name, GUEST_NAME);
  ws.close();
}));

test("a second join on the same connection is ignored", withPresence({}, async (url) => {
  const ws = await open(url);
  const w = await join(ws);
  ws.send(JSON.stringify({ type: "join" }));
  const moved = nextRoom(ws, (v) => selfIn(v, w.id)?.x === 1);
  ws.send(JSON.stringify({ type: "move", x: 1, z: 1 }));
  const snapshot = await moved;
  assert.deepEqual(snapshot.players.map((p) => p.id), [w.id]);
  ws.close();
}));

// ---- S4 review hardening -------------------------------------------------


const rejected = (url, headers) =>
  new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.once("unexpected-response", (_req, res) => resolve(res.statusCode));
    ws.once("open", () => {
      ws.close();
      resolve("opened");
    });
    ws.once("error", () => resolve("error"));
  });

test("non-object frames after a join get an error and the server keeps serving", withPresence({}, async (url) => {
  const a = await open(url);
  await join(a);
  for (const frame of ["null", "5", "[]", '"move"', "true"]) {
    const reply = next(a, "error");
    a.send(frame);
    assert.equal((await reply).message, "invalid message", frame);
  }
  const b = await open(url);
  const wb = await join(b);
  assert.equal(wb.players.length, 2, "the server still answers a second client");
  closeAll(a, b);
}));

test("a null frame before a join does not crash the server", withPresence({}, async (url) => {
  const a = await open(url);
  const reply = next(a, "error");
  a.send("null");
  assert.equal((await reply).message, "invalid message");
  const w = await join(a);
  assert.equal(w.players.length, 1);
  a.close();
}));

test("an oversized frame closes only that socket (maxPayload)", withPresence({ maxPayload: 1024 }, async (url) => {
  const big = await open(url);
  await join(big);
  const shut = closed(big);
  big.send(JSON.stringify({ type: "move", x: 1, z: 1, pad: "x".repeat(4096) }));
  assert.equal(await shut, 1009, "message too big");
  const other = await open(url);
  const w = await join(other);
  assert.equal(w.players.length, 1, "the oversized socket left the room");
  other.close();
}));

test("the default maxPayload is small (4 KiB)", async () => {
  const { DEFAULT_MAX_PAYLOAD } = await import("../src/presence.mjs");
  assert.equal(DEFAULT_MAX_PAYLOAD, 4096);
});

test("open connections are capped, joined or not", withPresence({ maxConnections: 2 }, async (url) => {
  const a = await open(url);
  const b = await open(url);
  const c = await open(url);
  assert.equal(await closed(c), 1013, "try again later");
  a.close();
  await closed(a);
  await settle(50);
  const d = await open(url);
  const w = await join(d);
  assert.equal(w.players.length, 1);
  closeAll(b, d);
}));

test("the session is resolved lazily on join, not on connection", async () => {
  let lookups = 0;
  const counting = async (req) => {
    lookups += 1;
    return fakeResolver(req);
  };
  await withPresence({ resolveSession: counting }, async (url) => {
    const idle = await Promise.all([open(url), open(url), open(url, { cookie: FIXTURE_COOKIE })]);
    await settle(50);
    assert.equal(lookups, 0, "no database lookup before a join");
    const w = await join(idle[2]);
    assert.equal(w.players[0].name, "DanGG");
    assert.equal(lookups, 1);
    closeAll(...idle);
  })();
});

// Move and emote rate-limit drops are covered on a fake clock in presence-tick.test.mjs.

test("the default move and emote limits allow normal play", async () => {
  const { DEFAULT_MOVE_LIMIT, DEFAULT_EMOTE_LIMIT } = await import("../src/presence.mjs");
  assert.ok(DEFAULT_MOVE_LIMIT.perSecond >= 10 && DEFAULT_MOVE_LIMIT.perSecond <= 30);
  assert.ok(DEFAULT_EMOTE_LIMIT.perSecond <= 2);
});

test("an upgrade from a disallowed Origin is refused", withPresence({ allowedOrigins: ["http://world.example"] }, async (url) => {
  assert.equal(await rejected(url, { origin: "http://evil.example" }), 403);
  assert.equal(await rejected(url, { origin: "http://world.example" }), "opened");
  assert.equal(await rejected(url, {}), "opened", "non-browser clients send no Origin and carry no ambient cookie");
}));

test("by default only same-host and loopback origins may open a socket", async () => {
  const { originAllowed } = await import("../src/presence.mjs");
  const req = (origin, host = "127.0.0.1:28797") => ({ headers: { origin, host } });
  assert.equal(originAllowed(req("http://127.0.0.1:28797"), []), true, "same host");
  assert.equal(originAllowed(req("http://localhost:5173"), []), true, "the Vite dev proxy on loopback");
  assert.equal(originAllowed(req("https://other.nervix.example", "world.nervix.example"), []), false, "a sibling subdomain");
  assert.equal(originAllowed(req("http://localhost:5173", "world.nervix.example"), []), false, "loopback page against a public host");
  assert.equal(originAllowed(req("https://world.nervix.example", "api.internal:80"), ["https://world.nervix.example"]), true, "allowlisted");
  assert.equal(originAllowed(req("not a url"), []), false);
  assert.equal(originAllowed(req(undefined), []), true);
});

test("a socket whose session has ended is closed on the next recheck", async () => {
  let signedIn = true;
  const resolver = async () => (signedIn ? FIXTURE_USER : null);
  await withPresence({ resolveSession: resolver, sessionRecheckMs: 40 }, async (url) => {
    const member = await open(url, { cookie: FIXTURE_COOKIE });
    const w = await join(member);
    assert.equal(w.players[0].name, "DanGG");
    const shut = closed(member);
    signedIn = false;
    assert.equal(await shut, 4001, "session ended");
  })();
});

test("a guest socket is not closed by the session recheck", withPresence({ sessionRecheckMs: 30 }, async (url) => {
  const guest = await open(url);
  await join(guest);
  await settle(120);
  assert.equal(guest.readyState, WebSocket.OPEN);
  guest.close();
}));

const withDb = { skip: pgAvailable() ? false : "Postgres not reachable at PGHOST" };

test("the real routes context resolves a fixture cookie to the fixture display name", withDb, async () => {
  const db = createThrowawayDb({ prefix: "nervix_world_presence" });
  const ctx = createContext({ env: { DATABASE_URL: db.url } });
  const server = http.createServer(createRequestHandler(createRoutes(ctx)));
  try {
    const pool = new pg.Pool({ connectionString: db.url });
    try {
      await applySliceFixtures(pool);
    } finally {
      await pool.end();
    }
    attachPresence(server, { resolveSession: presenceSessionResolver(ctx) });
    const port = await pickTestPort(2);
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    const url = `ws://127.0.0.1:${port}/presence`;

    const member = await open(url, { cookie: SESSIONS.dangg });
    const wm = await join(member, { userId: "usr_test", name: "Test Builder" });
    assert.equal(wm.players[0].name, "DanGG");
    assert.match(wm.id, HANDLE_PATTERN);

    const stranger = await open(url, { cookie: "sess_does_not_exist" });
    const ws = await join(stranger);
    const names = ws.players.map((p) => p.name).sort();
    assert.deepEqual(names, ["DanGG", GUEST_NAME].sort());
    for (const frame of [...member.frames, ...stranger.frames]) assert.doesNotMatch(frame, USER_ID, frame);
    closeAll(member, stranger);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await ctx.db.store.close();
    db.drop();
  }
});
