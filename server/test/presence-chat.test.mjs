/**
 * CT3 player chat inside one place. Pure moderation rules first, then real
 * sockets on a fake clock: a `say` reaches only the sender's place, caps and
 * the rate limit hold, moderated text is rejected, and nothing is retained.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { attachPresence } from "../src/presence.mjs";
import { DEFAULT_SAY_LIMIT, SAY_MAX_CHARS, cleanSay, moderateSay } from "../src/presence-chat.mjs";
import { isDenied } from "../src/moderation.mjs";
import { createFakeClock } from "./helpers/fakeClock.mjs";
import { closeAll, join, next, open, send, sync, withPresence } from "./helpers/presenceClient.mjs";

const TICK = 100;
const frames = (ws, type) => ws.frames.map((f) => JSON.parse(f)).filter((f) => f.type === type);
const known = async (id) => id === "prop_dangg";

function withClock(options, fn) {
  const clock = createFakeClock();
  return withPresence(attachPresence, { tickMs: TICK, clock, isKnownProperty: known, ...options }, (url) => fn(url, clock));
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

// ---- pure rules ----

test("cleanSay strips control and format characters and collapses whitespace", () => {
  assert.equal(cleanSay("  hi\u0000 there\u0007\n\tfriend  "), "hi there friend");
  assert.equal(cleanSay("a‮b​c⁦d"), "abcd", "bidi overrides and zero-width characters go");
  assert.equal(cleanSay("\u0085x\u009F"), "x", "C1 controls go");
  assert.equal(cleanSay("ｈｅｌｌｏ"), "hello", "full-width letters fold to ASCII");
  assert.equal(cleanSay(42), "");
  assert.equal(cleanSay(null), "");
});

test("moderateSay enforces the cap in characters, not bytes", () => {
  assert.equal(SAY_MAX_CHARS, 140);
  assert.deepEqual(moderateSay("x".repeat(SAY_MAX_CHARS)), { ok: true, text: "x".repeat(SAY_MAX_CHARS) });
  assert.deepEqual(moderateSay("x".repeat(SAY_MAX_CHARS + 1)), { ok: false, reason: "too long" });
  assert.equal(moderateSay("é".repeat(SAY_MAX_CHARS)).ok, true, "two-byte letters count once");
  assert.equal(moderateSay("😀".repeat(SAY_MAX_CHARS)).ok, true, "astral characters count once");
});

test("moderateSay rejects empty, non-string and moderated text", () => {
  assert.deepEqual(moderateSay(""), { ok: false, reason: "empty" });
  assert.deepEqual(moderateSay(" \u0000​ "), { ok: false, reason: "empty" });
  assert.deepEqual(moderateSay({ text: "hi" }), { ok: false, reason: "empty" });
  assert.deepEqual(moderateSay("well shit"), { ok: false, reason: "moderated" });
  assert.deepEqual(moderateSay("see www.example.com"), { ok: false, reason: "moderated" }, "no links");
  assert.deepEqual(moderateSay("go to https://x.io"), { ok: false, reason: "moderated" });
  assert.deepEqual(moderateSay("Hello, plaza!"), { ok: true, text: "Hello, plaza!" });
});

test("the deny-list sees through case, accents, leetspeak and spaced letters but not innocent words", () => {
  for (const text of ["SHIT", "sh1t", "$hit", "s h i t", "s.h.i.t", "shït", "Fuuck"]) {
    assert.equal(isDenied(text), true, text);
  }
  for (const text of ["Scunthorpe", "class assignment", "shiitake soup", "cocktail hour", "a b c"]) {
    assert.equal(isDenied(text), false, text);
  }
});

test("the default say limit allows a short burst, then one line every two seconds", () => {
  assert.deepEqual(DEFAULT_SAY_LIMIT, { burst: 3, perSecond: 0.5 });
});

test("player chat never touches merchant conversations", () => {
  for (const file of ["../src/presence-chat.mjs", "../src/moderation.mjs"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /conversation|agent|merchant/i, file);
  }
});

// ---- over sockets ----

test("a say reaches everyone in the same place, the sender included, and nobody elsewhere", withClock({}, async (url) => {
  const a = await open(url);
  const b = await open(url);
  const c = await open(url);
  const wa = await joined(a);
  await joined(b);
  await joined(c, { place: "prop_dangg" });

  const heard = next(b, "say");
  const echoed = next(a, "say");
  await say(a, "  hello   plaza\u0000 ");
  const [line, echo] = await Promise.all([heard, echoed]);
  await sync(c);

  assert.deepEqual(line, { type: "say", id: wa.id, name: "Guest", place: "plaza", text: "hello plaza" });
  assert.deepEqual(echo, line);
  assert.deepEqual(frames(c, "say"), [], "another place hears nothing");
  closeAll(a, b, c);
}));

test("a say frame carries the handle and never the user id", withClock({
  resolveSession: async () => ({ id: "usr_secret42", displayName: "Ana" }),
}, async (url) => {
  const a = await open(url, { cookie: "s" });
  const b = await open(url);
  const wa = await joined(a);
  await joined(b);
  const heard = next(b, "say");
  await say(a, "hi");
  const line = await heard;
  assert.deepEqual(Object.keys(line).sort(), ["id", "name", "place", "text", "type"]);
  assert.equal(line.id, wa.id);
  assert.equal(line.name, "Ana");
  assert.doesNotMatch(JSON.stringify(b.frames), /usr_secret42/);
  closeAll(a, b);
}));

test("after a place change a say goes to the new room only", withClock({}, async (url) => {
  const a = await open(url);
  const plaza = await open(url);
  const house = await open(url);
  await joined(a);
  await joined(plaza);
  await joined(house, { place: "prop_dangg" });
  send(a, { type: "place", place: "prop_dangg" });
  const heard = next(house, "say");
  await say(a, "knock knock");
  assert.equal((await heard).place, "prop_dangg");
  await sync(plaza);
  assert.deepEqual(frames(plaza, "say"), []);
  closeAll(a, plaza, house);
}));

test("a line stamped for a place the sender has left is refused", withClock({}, async (url) => {
  const a = await open(url);
  const b = await open(url);
  await joined(a);
  await joined(b);
  await say(a, "from the house", { place: "prop_dangg" });
  await sync(b);
  assert.deepEqual(frames(a, "say-rejected").map((f) => f.reason), ["wrong place"]);
  assert.deepEqual(frames(b, "say"), []);
  closeAll(a, b);
}));

test("over-long, empty and moderated lines are rejected to the sender and reach nobody", withClock({}, async (url) => {
  const a = await open(url);
  const b = await open(url);
  await joined(a);
  await joined(b);
  await say(a, "y".repeat(SAY_MAX_CHARS + 1));
  await say(a, "​\u0000");
  await say(a, "you f u c k");
  await sync(b);
  assert.deepEqual(frames(a, "say-rejected").map((f) => f.reason), ["too long", "empty", "moderated"]);
  assert.deepEqual(frames(b, "say"), []);
  assert.deepEqual(frames(a, "say"), []);
  closeAll(a, b);
}));

test("the say rate limit drops a flood and refills with time", withClock({}, async (url, clock) => {
  const a = await open(url);
  const b = await open(url);
  await joined(a);
  await joined(b);
  for (let i = 1; i <= 5; i += 1) await say(a, `line ${i}`);
  await sync(b);
  assert.deepEqual(frames(b, "say").map((f) => f.text), ["line 1", "line 2", "line 3"]);
  assert.deepEqual(frames(a, "say-rejected").map((f) => f.reason), ["rate limited", "rate limited"]);

  clock.advance(2000);
  await say(a, "line 6");
  await sync(b);
  assert.deepEqual(frames(b, "say").map((f) => f.text).slice(-1), ["line 6"]);
  closeAll(a, b);
}));

test("the say limit is configurable", withClock({ sayLimit: { burst: 1, perSecond: 0.1 } }, async (url) => {
  const a = await open(url);
  await joined(a);
  await say(a, "one");
  await say(a, "two");
  assert.deepEqual(frames(a, "say").map((f) => f.text), ["one"]);
  assert.deepEqual(frames(a, "say-rejected").map((f) => f.reason), ["rate limited"]);
  closeAll(a);
}));

test("chat is not retained: a later joiner never receives an earlier line", withClock({}, async (url, clock) => {
  const a = await open(url);
  await joined(a);
  await say(a, "remember-me-not");
  clock.advance(TICK);
  const late = await open(url);
  await joined(late);
  clock.advance(TICK);
  await sync(late);
  assert.doesNotMatch(late.frames.join("\n"), /remember-me-not/);
  closeAll(a, late);
}));

test("a say before join, or with a non-string text, never reaches anyone", withClock({}, async (url) => {
  const early = await open(url);
  const b = await open(url);
  await joined(b);
  send(early, { type: "say", text: "too early" });
  await joined(early); // queued behind the say, so the say was handled first
  await sync(b);
  assert.deepEqual(frames(b, "say"), []);
  assert.deepEqual(frames(early, "say-rejected"), [], "not joined: ignored like a move");

  await say(early, ["array"]);
  assert.deepEqual(frames(early, "say-rejected").map((f) => f.reason), ["empty"]);
  closeAll(early, b);
}));
