import test from "node:test";
import assert from "node:assert/strict";

import { LEVELS, resolveLevel, requireLevel, safeAppUrl, AccessError } from "../src/entitlement.mjs";

const verified = { id: "u1", emailVerified: true, profileCompleted: true };
const unverified = { id: "u2", emailVerified: true, profileCompleted: false };
const active = { active: true, source: "fixture" };
const inactive = { active: false, source: "fixture" };

test("signed out is the default and fails closed", () => {
  assert.equal(resolveLevel({ user: null }), LEVELS.SIGNED_OUT);
});

test("signed-up free account explores only", () => {
  assert.equal(resolveLevel({ user: unverified, subscription: active }), LEVELS.EXPLORE);
});

test("completed account browses without a subscription", () => {
  assert.equal(resolveLevel({ user: verified, subscription: inactive }), LEVELS.BROWSE);
});

test("active subscriber with completed account builds", () => {
  assert.equal(resolveLevel({ user: verified, subscription: active }), LEVELS.BUILD);
});

test("no subscription source means nobody builds", () => {
  assert.equal(resolveLevel({ user: verified }), LEVELS.BROWSE);
});

test("level gates are monotonic", () => {
  assert.equal(requireLevel(LEVELS.BUILD, LEVELS.BROWSE), true);
  assert.throws(() => requireLevel(LEVELS.BROWSE, LEVELS.BUILD), AccessError);
  assert.throws(() => requireLevel(LEVELS.EXPLORE, LEVELS.BROWSE), AccessError);
});

test("app urls must be https and credential-free", () => {
  assert.match(safeAppUrl("https://app.example.test/x") ?? "", /^https:\/\/app\.example\.test\/x$/);
  for (const bad of ["http://app.example.test", "https://u:p@app.example.test", "https://localhost/x", "https://svc.internal/x", "javascript:alert(1)"]) {
    assert.equal(safeAppUrl(bad), null, bad);
  }
});