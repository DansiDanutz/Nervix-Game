import test from "node:test";
import assert from "node:assert/strict";
import { isTypingTarget, keyName } from "./keys.ts";

const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable });

test("text inputs, textareas, selects and editable content are typing targets", () => {
  assert.equal(isTypingTarget(el("INPUT")), true);
  assert.equal(isTypingTarget(el("TEXTAREA")), true);
  assert.equal(isTypingTarget(el("SELECT")), true);
  assert.equal(isTypingTarget(el("DIV", true)), true);
});

test("buttons, the canvas, the window and null are not typing targets", () => {
  assert.equal(isTypingTarget(el("BUTTON")), false);
  assert.equal(isTypingTarget(el("CANVAS")), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget({}), false);
  assert.equal(isTypingTarget("INPUT"), false);
});

test("keyName lower-cases letters and keeps named keys", () => {
  assert.equal(keyName({ key: "W" }), "w");
  assert.equal(keyName({ key: "Escape" }), "escape");
  assert.equal(keyName({ key: "Enter" }), "enter");
});
