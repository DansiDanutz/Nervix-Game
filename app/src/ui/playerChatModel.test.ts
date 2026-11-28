import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capDraft, chatKeyIntent, type ChatKeyInput } from "./playerChatModel.ts";
import { EMPTY_KEYS, pressKey } from "../input/keys.ts";

const base: ChatKeyInput = { key: "t", inChat: false, typing: false, activatable: false, enterFocuses: true };
const intent = (over: Partial<ChatKeyInput>) => chatKeyIntent({ ...base, ...over });

test("T or Enter in the world focuses the chat", () => {
  assert.equal(intent({ key: "t" }), "focus");
  assert.equal(intent({ key: "T" }), "focus");
  assert.equal(intent({ key: "Enter" }), "focus");
});

test("Enter leaves a focused button, link or door prompt alone", () => {
  assert.equal(intent({ key: "Enter", activatable: true }), null);
  assert.equal(intent({ key: "Enter", enterFocuses: false }), null, "a door in reach keeps Enter");
  assert.equal(intent({ key: "t", enterFocuses: false }), "focus", "T still opens chat at a door");
});

test("nothing focuses the chat from another field, with modifiers or on auto-repeat", () => {
  assert.equal(intent({ key: "t", typing: true }), null);
  assert.equal(intent({ key: "t", metaKey: true }), null);
  assert.equal(intent({ key: "t", ctrlKey: true }), null);
  assert.equal(intent({ key: "t", altKey: true }), null);
  assert.equal(intent({ key: "t", repeat: true }), null);
  assert.equal(intent({ key: "w" }), null);
});

test("inside the chat, Enter sends, Esc blurs, every other key types", () => {
  assert.equal(intent({ key: "Enter", inChat: true, typing: true }), "send");
  assert.equal(intent({ key: "Escape", inChat: true, typing: true }), "blur");
  assert.equal(intent({ key: "t", inChat: true, typing: true }), null);
  assert.equal(intent({ key: "w", inChat: true, typing: true }), null);
  assert.equal(intent({ key: "Enter", inChat: true, typing: true, repeat: true }), null, "a held Enter sends once");
});

test("typing w into the chat input never becomes a held movement key", () => {
  const chatInput = { tagName: "INPUT", isContentEditable: false };
  assert.equal(pressKey(EMPTY_KEYS, { key: "w", target: chatInput }), EMPTY_KEYS);
  assert.equal(pressKey(EMPTY_KEYS, { key: "W", target: chatInput }), EMPTY_KEYS);
});

test("PlayerChat filters keys with the shared typing filter and has an aria-live log", () => {
  const source = readFileSync(new URL("./PlayerChat.tsx", import.meta.url), "utf8");
  assert.match(source, /isTypingTarget/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="log"/);
  assert.match(source, /import "\.\/PlayerChat\.css"/);
  assert.doesNotMatch(source, /TalkToMerchant|AgentPanel|net\/api/, "never mixed with merchant chat");
});

test("Enter never sends while an IME is still composing", () => {
  assert.equal(intent({ key: "Enter", inChat: true, typing: true, composing: true }), null);
  assert.equal(intent({ key: "Escape", inChat: true, typing: true, composing: true }), null, "Esc cancels the composition, not the chat");
  assert.equal(intent({ key: "Enter", inChat: true, typing: true, composing: false }), "send");
});

test("capDraft counts code points, so emoji lines get the full cap", () => {
  assert.equal(capDraft("😀".repeat(140), 140), "😀".repeat(140));
  assert.equal(capDraft("😀".repeat(141), 140), "😀".repeat(140));
  assert.equal(capDraft("x".repeat(150), 140), "x".repeat(140));
  assert.equal(capDraft("hi", 140), "hi");
});

test("PlayerChat caps by code points, checks composition and only T opens chat by default", () => {
  const source = readFileSync(new URL("./PlayerChat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /maxLength=/, "maxLength counts UTF-16 units");
  assert.match(source, /capDraft\(/);
  assert.match(source, /isComposing/);
  assert.match(source, /enterFocuses = false/);
});
