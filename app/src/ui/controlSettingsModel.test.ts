import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_SETTINGS_KEY, DEFAULT_CONTROL_SETTINGS, SENSITIVITY_RANGE, createControlSettingsStore, isReducedMotion,
  loadControlSettings, parseControlSettings, saveControlSettings, scaleLook, withSetting, type StorageLike,
} from "./controlSettingsModel.ts";
import { applyLook } from "../player/cameraRig.ts";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}
const throwing: StorageLike = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
};

test("defaults: system motion, sensitivity 1, Y not inverted, no pointer lock", () => {
  assert.deepEqual(DEFAULT_CONTROL_SETTINGS, { reducedMotion: "system", lookSensitivity: 1, invertY: false, pointerLock: false });
  assert.ok(Object.isFrozen(DEFAULT_CONTROL_SETTINGS));
});

test("parse keeps valid fields, replaces invalid ones and clamps sensitivity to the range and step", () => {
  assert.deepEqual(parseControlSettings({ reducedMotion: "on", lookSensitivity: 2, invertY: true, pointerLock: true }),
    { reducedMotion: "on", lookSensitivity: 2, invertY: true, pointerLock: true });
  assert.deepEqual(parseControlSettings({ reducedMotion: "fast", lookSensitivity: "x", invertY: 1, pointerLock: null }), DEFAULT_CONTROL_SETTINGS);
  assert.equal(parseControlSettings({ lookSensitivity: 99 }).lookSensitivity, SENSITIVITY_RANGE.max);
  assert.equal(parseControlSettings({ lookSensitivity: 0 }).lookSensitivity, SENSITIVITY_RANGE.min);
  assert.equal(parseControlSettings({ lookSensitivity: 1.3 }).lookSensitivity, 1.25);
  assert.deepEqual(parseControlSettings('{"invertY":true}'), { ...DEFAULT_CONTROL_SETTINGS, invertY: true });
  assert.deepEqual(parseControlSettings("{not json"), DEFAULT_CONTROL_SETTINGS);
  assert.deepEqual(parseControlSettings(null), DEFAULT_CONTROL_SETTINGS);
  assert.deepEqual(parseControlSettings([1, 2]), DEFAULT_CONTROL_SETTINGS);
  assert.ok(Object.isFrozen(parseControlSettings({})));
});

test("withSetting returns a new frozen copy and leaves the original alone", () => {
  const next = withSetting(DEFAULT_CONTROL_SETTINGS, "invertY", true);
  assert.equal(next.invertY, true);
  assert.equal(DEFAULT_CONTROL_SETTINGS.invertY, false);
  assert.notEqual(next, DEFAULT_CONTROL_SETTINGS);
  assert.ok(Object.isFrozen(next));
  assert.equal(withSetting(DEFAULT_CONTROL_SETTINGS, "lookSensitivity", 50).lookSensitivity, SENSITIVITY_RANGE.max);
});

test("sensitivity scales both axes; invert Y flips only the vertical", () => {
  assert.deepEqual(scaleLook(DEFAULT_CONTROL_SETTINGS, 10, 4), { dx: 10, dy: 4 });
  assert.deepEqual(scaleLook(withSetting(DEFAULT_CONTROL_SETTINGS, "lookSensitivity", 2), 10, 4), { dx: 20, dy: 8 });
  assert.deepEqual(scaleLook(withSetting(DEFAULT_CONTROL_SETTINGS, "invertY", true), 10, 4), { dx: 10, dy: -4 });
});

test("sensitivity 2 doubles the yaw change of the same drag (through applyLook)", () => {
  const base = 0.005;
  const look = { yaw: 0, pitch: 0.2 };
  const one = scaleLook(DEFAULT_CONTROL_SETTINGS, 40, 0);
  const two = scaleLook(withSetting(DEFAULT_CONTROL_SETTINGS, "lookSensitivity", 2), 40, 0);
  const a = applyLook(look, one.dx, one.dy, base);
  const b = applyLook(look, two.dx, two.dy, base);
  assert.ok(Math.abs(b.yaw - 2 * a.yaw) < 1e-9);
  const inv = scaleLook(withSetting(DEFAULT_CONTROL_SETTINGS, "invertY", true), 0, 20);
  assert.ok(applyLook(look, inv.dx, inv.dy, base).pitch < look.pitch, "inverted drag down looks up");
});

test("reduced motion: system follows the media query, on and off override it", () => {
  assert.equal(isReducedMotion(DEFAULT_CONTROL_SETTINGS, true), true);
  assert.equal(isReducedMotion(DEFAULT_CONTROL_SETTINGS, false), false);
  assert.equal(isReducedMotion(withSetting(DEFAULT_CONTROL_SETTINGS, "reducedMotion", "on"), false), true);
  assert.equal(isReducedMotion(withSetting(DEFAULT_CONTROL_SETTINGS, "reducedMotion", "off"), true), false);
});

test("load and save round-trip through storage under one key", () => {
  const storage = memoryStorage();
  const s = withSetting(DEFAULT_CONTROL_SETTINGS, "pointerLock", true);
  assert.equal(saveControlSettings(storage, s), true);
  assert.deepEqual(JSON.parse(storage.data[CONTROL_SETTINGS_KEY]), s);
  assert.deepEqual(loadControlSettings(storage), s);
});

test("storage that throws or is missing never breaks the controls", () => {
  assert.deepEqual(loadControlSettings(throwing), DEFAULT_CONTROL_SETTINGS);
  assert.equal(saveControlSettings(throwing, DEFAULT_CONTROL_SETTINGS), false);
  assert.deepEqual(loadControlSettings(null), DEFAULT_CONTROL_SETTINGS);
  assert.equal(saveControlSettings(null, DEFAULT_CONTROL_SETTINGS), false);
  assert.deepEqual(loadControlSettings(memoryStorage({ [CONTROL_SETTINGS_KEY]: "garbage" })), DEFAULT_CONTROL_SETTINGS);
});

test("the store loads once, saves on set, notifies listeners and survives a failing storage", () => {
  const storage = memoryStorage({ [CONTROL_SETTINGS_KEY]: JSON.stringify({ invertY: true }) });
  const store = createControlSettingsStore(storage);
  assert.equal(store.get().invertY, true);
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  const next = withSetting(store.get(), "lookSensitivity", 1.5);
  store.set(next);
  assert.equal(store.get(), next);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(storage.data[CONTROL_SETTINGS_KEY]).lookSensitivity, 1.5);
  store.set(next);
  assert.equal(calls, 1, "same value is not a change");
  off();
  store.set(withSetting(next, "invertY", false));
  assert.equal(calls, 1, "unsubscribed");

  const fragile = createControlSettingsStore(throwing);
  fragile.set(withSetting(fragile.get(), "invertY", true));
  assert.equal(fragile.get().invertY, true, "kept in memory for this visit when storage fails");
});
