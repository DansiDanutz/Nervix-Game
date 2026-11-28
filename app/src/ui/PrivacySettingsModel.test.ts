import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_PRIVACY_PANEL, canSavePrivacy, privacyPanelReducer, type PrivacyPanelState } from "./PrivacySettingsModel.ts";

const run = (events: Parameters<typeof privacyPanelReducer>[1][], from: PrivacyPanelState = INITIAL_PRIVACY_PANEL) => events.reduce(privacyPanelReducer, from);
const VISIBLE = { hideName: false, anonymous: false };

test("starts loading with nothing to save", () => {
  assert.deepEqual(INITIAL_PRIVACY_PANEL, { status: "loading", saved: null, chosen: null, error: null });
  assert.equal(canSavePrivacy(INITIAL_PRIVACY_PANEL), false);
});

test("loaded settles saved and chosen; toggling enables save, toggling back disables it", () => {
  const loaded = run([{ type: "loaded", settings: VISIBLE }]);
  assert.deepEqual(loaded, { status: "ready", saved: VISIBLE, chosen: VISIBLE, error: null });
  const hidden = privacyPanelReducer(loaded, { type: "toggle", key: "hideName" });
  assert.deepEqual(hidden.chosen, { hideName: true, anonymous: false });
  assert.equal(canSavePrivacy(hidden), true);
  assert.deepEqual(loaded.chosen, VISIBLE, "the previous state is not mutated");
  assert.equal(canSavePrivacy(privacyPanelReducer(hidden, { type: "toggle", key: "hideName" })), false);
});

test("toggles are ignored while loading or saving", () => {
  assert.equal(privacyPanelReducer(INITIAL_PRIVACY_PANEL, { type: "toggle", key: "anonymous" }), INITIAL_PRIVACY_PANEL);
  const saving = run([{ type: "loaded", settings: VISIBLE }, { type: "toggle", key: "anonymous" }, { type: "save" }]);
  assert.equal(saving.status, "saving");
  assert.equal(privacyPanelReducer(saving, { type: "toggle", key: "hideName" }), saving);
});

test("saved settles on the server's answer; a failed save keeps the choice with an error", () => {
  const chosen = run([{ type: "loaded", settings: VISIBLE }, { type: "toggle", key: "anonymous" }, { type: "save" }]);
  const failed = privacyPanelReducer(chosen, { type: "failed", error: "too many privacy changes" });
  assert.deepEqual([failed.status, failed.chosen, failed.error], ["ready", { hideName: false, anonymous: true }, "too many privacy changes"]);
  const done = privacyPanelReducer(chosen, { type: "saved", settings: { hideName: false, anonymous: true } });
  assert.deepEqual(done, { status: "ready", saved: { hideName: false, anonymous: true }, chosen: { hideName: false, anonymous: true }, error: null });
});

test("a failed load is an error that retry restarts", () => {
  const failed = run([{ type: "failed", error: "offline" }]);
  assert.equal(failed.status, "error");
  assert.equal(privacyPanelReducer(failed, { type: "retry" }), INITIAL_PRIVACY_PANEL);
});
