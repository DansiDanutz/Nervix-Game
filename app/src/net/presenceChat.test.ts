import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUBBLE_MS, LOG_MAX, SAY_MAX_CHARS, bubblesOf, cleanSay, createChatStore, emptyChat, receiveChatFrame, sayMessage,
} from "./presenceChat.ts";

const sayFrame = (id: string, text: string, place = "plaza", name = "Ana") => ({ type: "say", id, name, place, text });

test("the client cap mirrors the server cap", () => {
  const server = readFileSync(new URL("../../../server/src/presence-chat.mjs", import.meta.url), "utf8");
  assert.match(server, new RegExp(`SAY_MAX_CHARS = ${SAY_MAX_CHARS};`));
});

test("cleanSay strips controls and bidi characters and collapses whitespace", () => {
  assert.equal(cleanSay("  hi\u0000‮  there\n"), "hi there");
  assert.equal(cleanSay(7 as unknown as string), "");
});

test("sayMessage stamps the place so the server can refuse a line meant for a room just left", () => {
  assert.deepEqual(sayMessage(" hello ", "prop_dangg"), { type: "say", text: "hello", place: "prop_dangg" });
});

test("a say for this place is logged; a say for another place is ignored", () => {
  const start = emptyChat("plaza");
  const one = receiveChatFrame(start, sayFrame("p_a", "hello"), "p_me", 1000);
  assert.deepEqual(one.lines.map((l) => [l.from, l.name, l.text, l.self, l.at]), [["p_a", "Ana", "hello", false, 1000]]);
  assert.equal(receiveChatFrame(one, sayFrame("p_b", "psst", "prop_dangg"), "p_me", 1001), one);
  assert.equal(start.lines.length, 0, "never mutated");
});

test("this player's own echoed line is marked self", () => {
  const state = receiveChatFrame(emptyChat("plaza"), sayFrame("p_me", "me"), "p_me", 5);
  assert.equal(state.lines[0].self, true);
});

test("malformed say frames are ignored", () => {
  const start = emptyChat("plaza");
  for (const frame of [{ type: "say" }, { type: "say", id: 1, text: "x", place: "plaza" }, null, "say", { type: "say", id: "p", place: "plaza", text: "" }]) {
    assert.equal(receiveChatFrame(start, frame, null, 1), start);
  }
});

test("the log keeps only the latest lines, in memory only", () => {
  let state = emptyChat("plaza");
  for (let i = 0; i < LOG_MAX + 5; i += 1) state = receiveChatFrame(state, sayFrame("p_a", `l${i}`), null, i);
  assert.equal(state.lines.length, LOG_MAX);
  assert.equal(state.lines[0].text, "l5");
  assert.equal(new Set(state.lines.map((l) => l.key)).size, LOG_MAX, "unique keys");
});

test("a rejection becomes a readable notice, and the next accepted own line clears it", () => {
  const rejected = receiveChatFrame(emptyChat("plaza"), { type: "say-rejected", reason: "moderated" }, "p_me", 1);
  assert.match(rejected.notice ?? "", /not allowed/i);
  assert.match(receiveChatFrame(emptyChat("plaza"), { type: "say-rejected", reason: "rate limited" }, null, 1).notice ?? "", /slow/i);
  assert.match(receiveChatFrame(emptyChat("plaza"), { type: "say-rejected", reason: "odd" }, null, 1).notice ?? "", /not sent/i);
  assert.equal(receiveChatFrame(rejected, sayFrame("p_me", "fine"), "p_me", 2).notice, null);
});

test("bubbles show each speaker's latest line until it expires", () => {
  let state = emptyChat("plaza");
  state = receiveChatFrame(state, sayFrame("p_a", "first"), "p_me", 0);
  state = receiveChatFrame(state, sayFrame("p_b", "bee"), "p_me", 100);
  state = receiveChatFrame(state, sayFrame("p_a", "second"), "p_me", 200);
  assert.deepEqual(bubblesOf(state, 300).map((b) => [b.playerId, b.text]), [["p_b", "bee"], ["p_a", "second"]]);
  assert.deepEqual(bubblesOf(state, 100 + BUBBLE_MS).map((b) => b.playerId), ["p_a"]);
  assert.deepEqual(bubblesOf(state, 200 + BUBBLE_MS), []);
  assert.equal(bubblesOf(state, 300)[1].expiresAt, 200 + BUBBLE_MS);
});

test("the store clears the log on a place change and keeps it for the same place", () => {
  const store = createChatStore("plaza");
  store.receive(sayFrame("p_a", "hi"), null, 1);
  store.enterPlace("plaza");
  assert.equal(store.get().lines.length, 1);
  store.enterPlace("prop_dangg");
  assert.deepEqual(store.get(), emptyChat("prop_dangg"));
});

test("the store notifies subscribers and stops after unsubscribe", () => {
  const store = createChatStore("plaza");
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.receive(sayFrame("p_a", "hi"), null, 1);
  off();
  store.receive(sayFrame("p_a", "again"), null, 2);
  assert.equal(calls, 1);
});

test("say sends a cleaned line through the live socket, and refuses locally what the server would refuse", () => {
  const store = createChatStore("plaza");
  assert.deepEqual(store.say("hi"), { ok: false, reason: "offline" });
  assert.match(store.get().notice ?? "", /offline/i);

  const sent: string[] = [];
  store.setSender((frame) => sent.push(JSON.stringify(frame)));
  assert.deepEqual(store.say("  hi  there "), { ok: true });
  assert.deepEqual(sent.map((s) => JSON.parse(s)), [{ type: "say", text: "hi there", place: "plaza" }]);
  assert.equal(store.get().lines.length, 0, "a line shows only once the server echoes it");

  assert.deepEqual(store.say("​ "), { ok: false, reason: "empty" });
  assert.deepEqual(store.say("x".repeat(SAY_MAX_CHARS + 1)), { ok: false, reason: "too long" });
  assert.equal(sent.length, 1);

  store.setSender(null);
  assert.deepEqual(store.say("bye"), { ok: false, reason: "offline" });
});

test("player chat is separate from merchant chat", () => {
  const source = readFileSync(new URL("./presenceChat.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(agent|merchant|conversation|api)/i);
});
