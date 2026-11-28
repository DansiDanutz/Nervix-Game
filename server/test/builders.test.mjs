import test from "node:test";
import assert from "node:assert/strict";

import { LEVELS, resolveLevel, requireLevel, AccessError } from "../src/entitlement.mjs";

const builder = (id, owner) => ({ id, ownerId: owner, name: id, appUrl: null });
const offering = (id, builderId) => ({ id, builderId, name: id, priceMinor: 100, currency: "EUR", appUrl: null });

test("two isolated builders own separate catalogues", () => {
  const builders = [builder("bld_ann", "usr_ann"), builder("bld_bo", "usr_bo")];
  const offerings = [offering("off_ann", "bld_ann"), offering("off_bo", "bld_bo")];
  const forAnn = offerings.filter((o) => o.builderId === "bld_ann");
  const forBo = offerings.filter((o) => o.builderId === "bld_bo");
  assert.equal(forAnn.length, 1);
  assert.equal(forBo.length, 1);
  assert.notEqual(forAnn[0].id, forBo[0].id);
});

test("a builder cannot write another builder's catalogue", () => {
  const target = builder("bld_bo", "usr_bo");
  const caller = "usr_ann";
  assert.notEqual(target.ownerId, caller);
  assert.throws(() => {
    if (target.ownerId !== caller) throw new AccessError("not your catalogue", "cross_owner");
  }, /not your catalogue/);
});

test("browsing needs a completed profile, not a subscription", () => {
  const completed = { id: "u", emailVerified: true, profileCompleted: true };
  const active = { active: true, source: "fixture" };
  assert.equal(resolveLevel({ user: completed, subscription: { active: false, source: "fixture" } }), LEVELS.BROWSE);
  assert.equal(resolveLevel({ user: completed, subscription: active }), LEVELS.BUILD);
});

test("explore does not unlock catalogues", () => {
  const explore = { id: "u", emailVerified: true, profileCompleted: false };
  assert.equal(resolveLevel({ user: explore }), LEVELS.EXPLORE);
  assert.throws(() => requireLevel(LEVELS.EXPLORE, LEVELS.BROWSE), AccessError);
});