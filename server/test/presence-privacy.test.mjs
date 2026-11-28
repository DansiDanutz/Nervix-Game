/**
 * C9 pure rules: the display-name policy (built on moderation.mjs), the
 * presence privacy settings, and the exact public presence field set.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateDisplayName, DisplayNameError, assertDisplayName, DISPLAY_NAME_MAX } from "../src/display-name.mjs";
import {
  ANON_NAME, DEFAULT_PRIVACY, FAIL_CLOSED_PRIVACY, PUBLIC_FIELDS, PrivacyError,
  mergePrivacyInput, privacyView, publicView, shownName,
} from "../src/presence-privacy.mjs";

test("ordinary display names pass and come back cleaned", () => {
  for (const name of ["DanGG", "Test Builder", "Fixture Admin", "Zoë", "J.R. O'Neil", "anna_b-2", "Ana+Bo", "Ada (demo)", "李小龙"]) {
    assert.deepEqual(validateDisplayName(name), { ok: true, name }, name);
  }
  assert.deepEqual(validateDisplayName("  Two   Spaces \t"), { ok: true, name: "Two Spaces" });
});

test("empty, too short, too long and non-string names are refused", () => {
  for (const name of ["", "   ", "a", 7, null, undefined, {}, "x".repeat(DISPLAY_NAME_MAX + 1)]) {
    assert.equal(validateDisplayName(name).ok, false, String(name));
  }
  assert.equal(validateDisplayName("x".repeat(DISPLAY_NAME_MAX)).ok, true);
});

test("names with markup, controls or other symbols are refused", () => {
  for (const name of ["<script>", "a/b", "back\\slash", "tab\u0007bell", "zero​width", "rtl‮abc", "at@home", "colon:x"]) {
    assert.deepEqual(validateDisplayName(name), { ok: false, reason: "characters" }, JSON.stringify(name));
  }
});

test("moderated words are refused however they are spelled", () => {
  for (const name of ["fuck you", "Sh1t Lord", "B!tch", "f u c k"]) {
    assert.deepEqual(validateDisplayName(name), { ok: false, reason: "moderated" }, name);
  }
});

test("links are refused", () => {
  for (const name of ["visit shop.com", "www.example", "dangg.gg"]) {
    assert.deepEqual(validateDisplayName(name), { ok: false, reason: "moderated" }, name);
  }
});

test("reserved and id-shaped names are refused, so nobody can pose as a guest, the anonymous label or a raw id", () => {
  for (const name of ["Guest", "guest", "G.u.e.s.t", "Anonymous", "ANON", "You", "Admin", "Moderator", "System", "Nervix", "Nervix Support", "NervixPay"]) {
    assert.deepEqual(validateDisplayName(name), { ok: false, reason: "reserved" }, name);
  }
  for (const name of ["usr_dangg", "demo_abc123", "p_0123456789ab", "prop_demo", "bld_test", "USR_X"]) {
    assert.deepEqual(validateDisplayName(name), { ok: false, reason: "reserved" }, name);
  }
});

test("assertDisplayName throws a DisplayNameError named for the dispatcher's 400", () => {
  assert.equal(assertDisplayName(" Snapper "), "Snapper");
  assert.throws(() => assertDisplayName("Guest"), (e) => e instanceof DisplayNameError && e.name === "invalid_display_name");
});

test("privacy defaults to names visible (D10) and fails closed to fully anonymous", () => {
  assert.deepEqual(DEFAULT_PRIVACY, { hideName: false, anonymous: false });
  assert.deepEqual(FAIL_CLOSED_PRIVACY, { hideName: true, anonymous: true });
  assert.ok(Object.isFrozen(DEFAULT_PRIVACY) && Object.isFrozen(FAIL_CLOSED_PRIVACY));
  assert.deepEqual(privacyView(null), DEFAULT_PRIVACY);
  assert.deepEqual(privacyView({ hideName: true, anonymous: false, updatedAt: "x", userId: "usr_a" }), { hideName: true, anonymous: false });
  assert.deepEqual(privacyView({ hideName: "yes", anonymous: 1 }), DEFAULT_PRIVACY, "only real booleans count");
});

test("a settings update merges booleans onto the current settings and returns a new frozen value", () => {
  const current = Object.freeze({ hideName: false, anonymous: false });
  const next = mergePrivacyInput(current, { hideName: true });
  assert.deepEqual(next, { hideName: true, anonymous: false });
  assert.ok(Object.isFrozen(next));
  assert.deepEqual(current, { hideName: false, anonymous: false }, "the current value is not mutated");
  assert.deepEqual(mergePrivacyInput(next, { anonymous: true, userId: "usr_ignored" }), { hideName: true, anonymous: true });
});

test("a malformed settings update is refused with a PrivacyError", () => {
  for (const body of [null, [], "x", {}, { userId: "usr_a" }, { hideName: "true" }, { anonymous: 1 }, { hideName: true, colour: "red" }]) {
    assert.throws(() => mergePrivacyInput(DEFAULT_PRIVACY, body), (e) => e instanceof PrivacyError && e.name === "invalid_privacy", JSON.stringify(body));
  }
});

test("the shown name: the display name unless hidden or anonymous, never a disallowed name", () => {
  assert.equal(shownName("DanGG", DEFAULT_PRIVACY), "DanGG");
  assert.equal(shownName("DanGG", { hideName: true, anonymous: false }), ANON_NAME);
  assert.equal(shownName("DanGG", { hideName: false, anonymous: true }), ANON_NAME);
  assert.equal(shownName("Sh1t Lord", DEFAULT_PRIVACY), ANON_NAME, "a stored name that fails the policy is never broadcast");
  assert.equal(shownName("usr_dangg", DEFAULT_PRIVACY), ANON_NAME);
});

test("the public presence fields are exactly {handle (as id), name or anon, preset, place, x, z, yaw}", () => {
  assert.deepEqual([...PUBLIC_FIELDS].sort(), ["id", "name", "place", "preset", "x", "yaw", "z"]);
  const record = Object.freeze({
    handle: "p_0123456789ab", userId: "usr_dangg", name: "DanGG", preset: "teal", place: "plaza",
    district: "central-plaza", x: 1, z: 2, yaw: 0.5, seq: 9, privacy: DEFAULT_PRIVACY,
  });
  const view = publicView(record);
  assert.deepEqual(Object.keys(view).sort(), [...PUBLIC_FIELDS].sort());
  assert.deepEqual(view, { id: "p_0123456789ab", name: "DanGG", preset: "teal", place: "plaza", x: 1, z: 2, yaw: 0.5 });
  assert.ok(!JSON.stringify(view).includes("usr_"), "never the user id");
});
