import test from "node:test";
import assert from "node:assert/strict";
import { createEscapeStack } from "./escapeLayers.ts";
import { shellKeyActions } from "./keys.ts";
import { shellInput, type ShellState } from "./shellInput.ts";

const button = { tagName: "BUTTON" };
const state = (over: Partial<ShellState> = {}): ShellState => ({ placeKind: "house", hasTarget: true, canCollectSeal: false, ...over });
const esc = (target: unknown = button) => ({ key: "Escape", target });

test("in a house, Esc with a visible house-only panel (focus on Send) closes the panel, not the house", () => {
  const stack = createEscapeStack();
  stack.push(() => undefined, () => true);
  assert.deepEqual(shellKeyActions(shellInput(esc(), state(), stack)), ["close-panels"]);
});

test("in a house, a registered but hidden side-column layer does not hold Esc back", () => {
  const stack = createEscapeStack();
  stack.push(() => undefined, () => false);
  assert.deepEqual(shellKeyActions(shellInput(esc(), state(), stack)), ["close-guide", "leave-place"]);
});

test("on the plaza, an open menu takes Esc first", () => {
  const stack = createEscapeStack();
  stack.push(() => undefined);
  const input = shellInput(esc(), state({ placeKind: "plaza", hasTarget: false }), stack);
  assert.equal(input.panelsOpen, true);
  assert.equal(input.atPlaza, true);
  assert.deepEqual(shellKeyActions(input), ["close-panels"]);
});

test("event fields are copied through (Enter on a focused button stays with the button)", () => {
  const input = shellInput({ key: "Enter", target: button, repeat: false, metaKey: false }, state(), createEscapeStack());
  assert.equal(input.key, "Enter");
  assert.equal(input.hasTarget, true);
  assert.deepEqual(shellKeyActions(input), []);
});
