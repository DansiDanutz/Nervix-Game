/**
 * CT3 repair: chat flood bounds. A say costs its socket token the moment the
 * frame arrives (so a slow join cannot pile up queued lines), every attempt
 * costs a token (a wrong-place line too), and lines are also limited per
 * signed-in user and per guest address, so many sockets from one client
 * cannot flood a room.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { attachPresence } from "../src/presence.mjs";
import { DEFAULT_SAY_ADDRESS_LIMIT, DEFAULT_SAY_LIMIT, DEFAULT_SAY_USER_LIMIT, createKeyedLimiter } from "../src/presence-chat-limits.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";
import { closeAll, join, next, open, send, sync, withPresence } from "./helpers/presenceClient.mjs";

const TICK = 100;
const WAIT_MS = 1000;
const POLL_MS = 10;
const frames = (ws, type) => ws.frames.map((f) => JSON.parse(f)).filter((f) => f.type === type);
const reasons = (ws) => frames(ws, "say-rejected").map((f) => f.reason);

function withClock(options, fn) {
  const clock = createFakeClock();
  return withPresence(attachPresence, { tickMs: TICK, clock, ...options }, (url) => fn(url, clock));
}

/** Real-time poll: resolves true once `predicate()` holds, false after WAIT_MS. */
async function eventually(predicate) {
  const end = Date.now() + WAIT_MS;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return predicate();
}

/** Joins and remembers the socket's own handle, so `say` can wait for its own echo. */
async function joined(ws, message) {
  const welcome = await join(ws, message);
  ws.selfId = welcome.id;
  return welcome;
}

/**
 * Sends a say from a joined `ws` and waits for its one answer: the echo of
 * its own line, or a `say-rejected`. No place frame is used as a barrier, so
 * the player's room never changes.
 */
async function say(ws, text, extra = {}) {
  const answered = new Promise((resolve) => {
    const onMessage = (raw) => {
      const f = JSON.parse(raw.toString());
      if (f.type !== "say-rejected" && !(f.type === "say" && f.id === ws.selfId)) return;
      ws.off("message", onMessage);
      resolve(f);
    };
    ws.on("message", onMessage);
  });
  send(ws, { type: "say", text, ...extra });
  return answered;
}

// ---- the keyed limiter ----

test("a keyed limiter keeps one bucket per key and forgets buckets that refilled", () => {
  let t = 0;
  const limiter = createKeyedLimiter({ burst: 2, perSecond: 1 }, () => t);
  assert.equal(limiter.take("a"), true);
  assert.equal(limiter.take("a"), true);
  assert.equal(limiter.take("a"), false, "a is empty");
  assert.equal(limiter.take("b"), true, "b has its own bucket");
  limiter.sweep();
  assert.equal(limiter.size(), 2, "partly empty buckets are kept");
  t = 2000;
  limiter.sweep();
  assert.equal(limiter.size(), 0, "refilled buckets are dropped");
  assert.equal(limiter.take("a"), true);
});

test("the shared say limits have sane defaults", () => {
  assert.deepEqual(DEFAULT_SAY_LIMIT, { burst: 3, perSecond: 0.5 });
  assert.deepEqual(DEFAULT_SAY_USER_LIMIT, { burst: 3, perSecond: 0.5 });
  assert.deepEqual(DEFAULT_SAY_ADDRESS_LIMIT, { burst: 6, perSecond: 1 });
});

// ---- over sockets ----

test("says sent while a join is still resolving are metered at once, not queued", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await withClock({ resolveSession: () => gate }, async (url) => {
    const a = await open(url);
    const welcome = next(a, "welcome");
    send(a, { type: "join" });
    for (let i = 0; i < 10; i += 1) send(a, { type: "say", text: `line ${i}` });
    const meteredEarly = await eventually(() => reasons(a).length === 7);
    release(null);
    await welcome;
    await eventually(() => frames(a, "say").length === 3);
    await sync(a);
    assert.equal(meteredEarly, true, "seven over-limit lines refused before the join finished");
    assert.deepEqual(frames(a, "say").map((f) => f.text), ["line 0", "line 1", "line 2"]);
    assert.equal(reasons(a).length, 7, "no extra refusals after the join");
    closeAll(a);
  })();
});

test("a wrong-place line costs a token like any other", withClock({ sayLimit: { burst: 1, perSecond: 0.1 } }, async (url) => {
  const a = await open(url);
  await joined(a);
  await say(a, "from the house", { place: "prop_dangg" });
  await say(a, "hello");
  assert.deepEqual(reasons(a), ["wrong place", "rate limited"]);
  assert.deepEqual(frames(a, "say"), []);
  closeAll(a);
}));

test("many guest sockets from one address share one say budget", withClock({
  sayAddressLimit: { burst: 2, perSecond: 0.1 },
}, async (url) => {
  const sockets = await Promise.all([open(url), open(url), open(url), open(url)]);
  const [listener, ...speakers] = sockets;
  for (const ws of sockets) await joined(ws);
  for (const [i, ws] of speakers.entries()) await say(ws, `guest ${i}`);
  await sync(listener);
  assert.deepEqual(frames(listener, "say").map((f) => f.text), ["guest 0", "guest 1"]);
  assert.deepEqual(reasons(speakers[2]), ["rate limited"]);
  closeAll(...sockets);
}));

test("a signed-in user is limited across all their sockets, separately from guests", withClock({
  resolveSession: async (req) => {
    const id = /nervix_session=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
    return id ? { id: `usr_${id}`, displayName: id } : null;
  },
  sayUserLimit: { burst: 1, perSecond: 0.1 },
  sayAddressLimit: { burst: 1, perSecond: 0.1 },
}, async (url) => {
  const ana1 = await open(url, { cookie: "ana" });
  const ana2 = await open(url, { cookie: "ana" });
  const bo = await open(url, { cookie: "bo" });
  const guest = await open(url);
  for (const ws of [ana1, ana2, bo, guest]) await joined(ws);
  await say(ana1, "ana one");
  await say(ana2, "ana two");
  await say(bo, "bo one");
  await say(guest, "guest one");
  await sync(guest);
  assert.deepEqual(frames(guest, "say").map((f) => f.text), ["ana one", "bo one", "guest one"]);
  assert.deepEqual(reasons(ana2), ["rate limited"]);
  closeAll(ana1, ana2, bo, guest);
}));
