import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_PICKER, createPickerReducer, canSave, radioKeyTarget, radioTabIndex, type PickerState } from "./avatarPickerModel.ts";
import { AVATAR_PRESETS } from "../net/api/avatar.ts";

const pickerReducer = createPickerReducer(AVATAR_PRESETS.map((p) => p.id));

const run = (events: Parameters<typeof pickerReducer>[1][], from: PickerState = INITIAL_PICKER) => events.reduce(pickerReducer, from);

test("starts loading with nothing chosen", () => {
  assert.deepEqual(INITIAL_PICKER, { status: "loading", saved: null, chosen: null, error: null });
  assert.equal(canSave(INITIAL_PICKER), false);
});

test("loaded sets both the saved and the chosen preset", () => {
  const s = run([{ type: "loaded", preset: "burgundy" }]);
  assert.deepEqual(s, { status: "ready", saved: "burgundy", chosen: "burgundy", error: null });
  assert.equal(canSave(s), false, "nothing changed yet");
});

test("choosing a different preset enables save; choosing an unknown id is ignored", () => {
  const s = run([{ type: "loaded", preset: "teal" }, { type: "choose", preset: "sage" }]);
  assert.equal(s.chosen, "sage");
  assert.equal(canSave(s), true);
  assert.equal(pickerReducer(s, { type: "choose", preset: "purple" }), s);
});

test("save then saved records the server's preset", () => {
  const s = run([{ type: "loaded", preset: "teal" }, { type: "choose", preset: "linen" }, { type: "save" }]);
  assert.equal(s.status, "saving");
  assert.equal(canSave(s), false, "no double submit");
  const done = pickerReducer(s, { type: "saved", preset: "linen" });
  assert.deepEqual(done, { status: "ready", saved: "linen", chosen: "linen", error: null });
});

test("a failed save keeps the choice and shows the error", () => {
  const s = run([{ type: "loaded", preset: "teal" }, { type: "choose", preset: "linen" }, { type: "save" }, { type: "failed", error: "sign in first" }]);
  assert.deepEqual(s, { status: "ready", saved: "teal", chosen: "linen", error: "sign in first" });
  assert.equal(canSave(s), true);
});

test("a failed load is an error state that cannot save", () => {
  const s = run([{ type: "failed", error: "offline" }]);
  assert.equal(s.status, "error");
  assert.equal(canSave(s), false);
});

test("the reducer never mutates its input", () => {
  const s = Object.freeze(run([{ type: "loaded", preset: "teal" }]));
  const next = pickerReducer(s, { type: "choose", preset: "sage" });
  assert.notEqual(next, s);
  assert.equal(s.chosen, "teal");
});

test("retry after a failed load goes back to loading; retry is ignored elsewhere", () => {
  const failed = run([{ type: "failed", error: "offline" }]);
  assert.deepEqual(pickerReducer(failed, { type: "retry" }), INITIAL_PICKER);
  const ready = run([{ type: "loaded", preset: "teal" }]);
  assert.equal(pickerReducer(ready, { type: "retry" }), ready);
});

const IDS = ["teal", "terracotta", "burgundy"] as const;

test("arrow keys move the radio selection and wrap; Home and End jump", () => {
  assert.equal(radioKeyTarget(IDS, "teal", "ArrowRight"), "terracotta");
  assert.equal(radioKeyTarget(IDS, "teal", "ArrowDown"), "terracotta");
  assert.equal(radioKeyTarget(IDS, "burgundy", "ArrowRight"), "teal");
  assert.equal(radioKeyTarget(IDS, "teal", "ArrowLeft"), "burgundy");
  assert.equal(radioKeyTarget(IDS, "terracotta", "ArrowUp"), "teal");
  assert.equal(radioKeyTarget(IDS, "terracotta", "Home"), "teal");
  assert.equal(radioKeyTarget(IDS, "teal", "End"), "burgundy");
});

test("other keys, or no current choice, give no target from arrows", () => {
  assert.equal(radioKeyTarget(IDS, "teal", "Enter"), null);
  assert.equal(radioKeyTarget(IDS, "teal", "a"), null);
  assert.equal(radioKeyTarget(IDS, null, "ArrowRight"), "teal");
  assert.equal(radioKeyTarget([], "teal", "ArrowRight"), null);
});

test("roving tabindex: only the chosen radio is tabbable, or the first when none is chosen", () => {
  assert.deepEqual(IDS.map((id) => radioTabIndex(IDS, "terracotta", id)), [-1, 0, -1]);
  assert.deepEqual(IDS.map((id) => radioTabIndex(IDS, null, id)), [0, -1, -1]);
  assert.deepEqual(IDS.map((id) => radioTabIndex(IDS, "unknown", id)), [0, -1, -1]);
});
