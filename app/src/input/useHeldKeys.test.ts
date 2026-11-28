import test from "node:test";
import assert from "node:assert/strict";
import { bindHeldKeys } from "./keys.ts";
import { EMPTY_KEYS, type HeldKeys } from "./keys.ts";

const keyEvent = (type: string, key: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Event(type), { key, metaKey: false, ...extra });

function setup() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as string });
  const ref: { current: HeldKeys } = { current: EMPTY_KEYS };
  const unbind = bindHeldKeys(win, doc, ref);
  return { win, doc, ref, unbind };
}

test("keydown holds and keyup releases a movement key", () => {
  const { win, ref } = setup();
  win.dispatchEvent(keyEvent("keydown", "w"));
  assert.equal(ref.current.has("w"), true);
  win.dispatchEvent(keyEvent("keyup", "w"));
  assert.equal(ref.current.has("w"), false);
});

test("window blur clears held keys", () => {
  const { win, ref } = setup();
  win.dispatchEvent(keyEvent("keydown", "w"));
  win.dispatchEvent(new Event("blur"));
  assert.equal(ref.current.size, 0);
});

test("a hidden tab clears held keys; becoming visible does not", () => {
  const { win, doc, ref } = setup();
  win.dispatchEvent(keyEvent("keydown", "w"));
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(ref.current.has("w"), true);
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(ref.current.size, 0);
});

test("unbinding removes every listener", () => {
  const { win, ref, unbind } = setup();
  unbind();
  win.dispatchEvent(keyEvent("keydown", "w"));
  assert.equal(ref.current.size, 0);
});
