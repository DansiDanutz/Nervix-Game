import test from "node:test";
import assert from "node:assert/strict";
import { createPresetStore } from "./presetStore.ts";

const KNOWN = new Set(["teal", "sage"]);
const isKnown = (v: unknown): v is string => typeof v === "string" && KNOWN.has(v);

test("starts empty and keeps a known preset, notifying readers", () => {
  const store = createPresetStore(isKnown);
  let calls = 0;
  store.subscribe(() => (calls += 1));
  assert.equal(store.get(), null);
  store.set("sage");
  assert.equal(store.get(), "sage");
  assert.equal(calls, 1);
});

test("an unknown or malformed preset is ignored", () => {
  const store = createPresetStore(isKnown);
  store.set("teal");
  store.set("neon");
  store.set(42 as unknown as string);
  assert.equal(store.get(), "teal");
});

test("clearing (sign-out) resets to null; unsubscribe stops notifications", () => {
  const store = createPresetStore(isKnown);
  let calls = 0;
  const off = store.subscribe(() => (calls += 1));
  store.set("teal");
  off();
  store.clear();
  assert.equal(store.get(), null);
  assert.equal(calls, 1);
});
