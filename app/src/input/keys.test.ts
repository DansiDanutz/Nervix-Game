import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_KEYS, isActivatableTarget, isTypingTarget, keyName, pressKey, releaseKey, shellKeyActions, type ShellKeyInput,
} from "./keys.ts";

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

/* CT1: held movement keys, activatable targets and shell key actions. */

const press = (key: string, extra: Record<string, unknown> = {}) => ({ key, target: el("CANVAS"), ...extra });

test("pressing adds the lower-cased key and returns a new set; releasing removes it", () => {
  const held = pressKey(EMPTY_KEYS, press("W"));
  assert.notEqual(held, EMPTY_KEYS);
  assert.equal(EMPTY_KEYS.size, 0);
  assert.equal(held.has("w"), true);
  const after = releaseKey(held, press("w"));
  assert.equal(after.has("w"), false);
  assert.equal(held.has("w"), true); // the old set is untouched
});

test("keys pressed while typing are never held", () => {
  assert.equal(pressKey(EMPTY_KEYS, { key: "w", target: el("INPUT") }).size, 0);
  assert.equal(pressKey(EMPTY_KEYS, { key: "w", target: el("SELECT") }).size, 0);
  assert.equal(pressKey(EMPTY_KEYS, { key: "w", target: el("DIV", true) }).size, 0);
});

test("a key pressed with a focused button still moves the player", () => {
  assert.equal(pressKey(EMPTY_KEYS, { key: "w", target: el("BUTTON") }).has("w"), true);
});

test("Meta down or up clears every held key (macOS drops keyup while Meta is held)", () => {
  const held = pressKey(pressKey(EMPTY_KEYS, press("w")), press("Shift"));
  assert.equal(pressKey(held, press("Meta")).size, 0);
  assert.equal(releaseKey(held, press("Meta")).size, 0);
  assert.equal(pressKey(held, press("w", { metaKey: true })).size, 0);
});

test("buttons, links, summaries and role=button elements are activatable; the canvas is not", () => {
  assert.equal(isActivatableTarget(el("BUTTON")), true);
  assert.equal(isActivatableTarget(el("A")), true);
  assert.equal(isActivatableTarget(el("SUMMARY")), true);
  assert.equal(isActivatableTarget({ tagName: "DIV", getAttribute: (n: string) => (n === "role" ? "button" : null) }), true);
  assert.equal(isActivatableTarget(el("INPUT")), true); // typing targets own Enter too
  assert.equal(isActivatableTarget(el("CANVAS")), false);
  assert.equal(isActivatableTarget(null), false);
});

const shell = (over: Partial<ShellKeyInput>): ShellKeyInput => ({
  key: "e", target: el("CANVAS"), panelsOpen: false, atPlaza: true, hasTarget: false, canCollectSeal: false, ...over,
});

test("E and Enter activate the door target from the canvas", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "e", hasTarget: true })), ["activate-target"]);
  assert.deepEqual(shellKeyActions(shell({ key: "Enter", hasTarget: true })), ["activate-target"]);
});

test("Enter on a focused button never activates a door; E still does", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "Enter", hasTarget: true, target: el("BUTTON") })), []);
  assert.deepEqual(shellKeyActions(shell({ key: "e", hasTarget: true, target: el("BUTTON") })), ["activate-target"]);
});

test("auto-repeat and modified keys never activate a door", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "e", hasTarget: true, repeat: true })), []);
  assert.deepEqual(shellKeyActions(shell({ key: "Enter", hasTarget: true, metaKey: true })), []);
  assert.deepEqual(shellKeyActions(shell({ key: "e", hasTarget: true, ctrlKey: true })), []);
});

test("E collects a seal only when there is no door target", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "e", canCollectSeal: true })), ["collect-seal"]);
  assert.deepEqual(shellKeyActions(shell({ key: "Enter", canCollectSeal: true })), []);
});

test("Esc closes open side panels first and does not leave the place", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "Escape", panelsOpen: true, atPlaza: false })), ["close-panels"]);
});

test("Esc with no panels open closes the guide and leaves a venue or house", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "Escape", atPlaza: false })), ["close-guide", "leave-place"]);
  assert.deepEqual(shellKeyActions(shell({ key: "Escape", atPlaza: true })), ["close-guide"]);
});

test("nothing fires while typing: Esc in a field does not leave the house", () => {
  for (const key of ["Escape", "Enter", "e", "g"]) {
    assert.deepEqual(shellKeyActions(shell({ key, atPlaza: false, hasTarget: true, target: el("TEXTAREA") })), []);
  }
});

test("G toggles the guide", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "G" })), ["toggle-guide"]);
});

test("a repeated Esc only ever closes panels: holding Esc never also leaves the place", () => {
  assert.deepEqual(shellKeyActions(shell({ key: "Escape", repeat: true, atPlaza: false })), []);
  assert.deepEqual(shellKeyActions(shell({ key: "Escape", repeat: true, atPlaza: true })), []);
  assert.deepEqual(shellKeyActions(shell({ key: "Escape", repeat: true, panelsOpen: true, atPlaza: false })), ["close-panels"]);
});
