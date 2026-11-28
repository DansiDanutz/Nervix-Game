import test from "node:test";
import assert from "node:assert/strict";

import { LEVELS } from "../src/entitlement.mjs";
import {
  authorizeHouseEdit,
  authorizeMerchantEdit,
  canEditHouse,
  validateHouseProfile,
  HouseProfileError,
} from "../src/house-authority.mjs";

const owner = { id: "usr_dangg" };
const other = { id: "usr_test" };
const dangg = { id: "mer_dangg", ownerId: "usr_dangg", verified: true, suspended: false };
const testMerchant = { id: "mer_test", ownerId: "usr_test", verified: true, suspended: false };
const danggHouse = { propertyId: "prop_dangg", ownerId: "usr_dangg", merchantId: "mer_dangg" };

const denial = (fn, code) => assert.throws(fn, (e) => e.code === code, `expected ${code}`);

test("verified merchant owner with build eligibility may edit their own house", () => {
  assert.equal(authorizeHouseEdit({ user: owner, level: LEVELS.BUILD, merchant: dangg, house: danggHouse }), true);
});

test("visitors are read-only", () => {
  denial(() => authorizeHouseEdit({ user: null, level: LEVELS.SIGNED_OUT, merchant: null, house: danggHouse }), "unauthorized");
  denial(() => authorizeHouseEdit({ user: { id: "usr_visitor" }, level: LEVELS.BROWSE, merchant: null, house: danggHouse }), "insufficient_level");
});

test("a subscription alone never grants merchant authority", () => {
  denial(() => authorizeHouseEdit({ user: { id: "usr_sub" }, level: LEVELS.BUILD, merchant: null, house: danggHouse }), "not_merchant");
});

test("an unverified merchant cannot customise", () => {
  denial(() => authorizeHouseEdit({ user: owner, level: LEVELS.BUILD, merchant: { ...dangg, verified: false }, house: danggHouse }), "unverified_merchant");
});

test("a suspended merchant cannot customise", () => {
  denial(() => authorizeHouseEdit({ user: owner, level: LEVELS.BUILD, merchant: { ...dangg, suspended: true }, house: danggHouse }), "suspended");
});

test("existing eligibility is respected: a verified merchant without build level is denied", () => {
  denial(() => authorizeHouseEdit({ user: owner, level: LEVELS.BROWSE, merchant: dangg, house: danggHouse }), "insufficient_level");
});

test("a verified merchant cannot edit another owner's house", () => {
  denial(() => authorizeHouseEdit({ user: other, level: LEVELS.BUILD, merchant: testMerchant, house: danggHouse }), "cross_owner");
});

test("a merchant record belonging to someone else is never accepted", () => {
  denial(() => authorizeHouseEdit({ user: other, level: LEVELS.BUILD, merchant: dangg, house: danggHouse }), "cross_owner");
});

test("a house bound to a different merchant of the same owner is denied", () => {
  denial(() => authorizeHouseEdit({ user: owner, level: LEVELS.BUILD, merchant: { ...dangg, id: "mer_other" }, house: danggHouse }), "cross_owner");
});

test("unknown house is reported before any permission detail", () => {
  denial(() => authorizeHouseEdit({ user: owner, level: LEVELS.BUILD, merchant: dangg, house: null }), "unknown_house");
});

test("canEditHouse mirrors the authorisation without throwing", () => {
  assert.equal(canEditHouse({ user: owner, level: LEVELS.BUILD, merchant: dangg, house: danggHouse }), true);
  assert.equal(canEditHouse({ user: other, level: LEVELS.BUILD, merchant: testMerchant, house: danggHouse }), false);
});

test("merchant-level edits require the verified owner", () => {
  assert.equal(authorizeMerchantEdit({ user: owner, level: LEVELS.BUILD, merchant: dangg }), true);
  denial(() => authorizeMerchantEdit({ user: other, level: LEVELS.BUILD, merchant: dangg }), "cross_owner");
  denial(() => authorizeMerchantEdit({ user: owner, level: LEVELS.BUILD, merchant: null }), "not_merchant");
  denial(() => authorizeMerchantEdit({ user: null, level: LEVELS.SIGNED_OUT, merchant: dangg }), "unauthorized");
});

test("profile validation keeps only whitelisted, bounded fields", () => {
  const p = validateHouseProfile({
    welcome: "  Welcome to DanGG  ",
    decor: { theme: "salon", accent: "#C9A441", banner: true, extra: "x" },
    display: { featuredListingIds: ["a", "b"], showApp: true },
    websiteUrl: "https://dangg.live/",
    ownerId: "usr_attacker",
  });
  assert.deepEqual(p, {
    welcome: "Welcome to DanGG",
    decor: { theme: "salon", accent: "#c9a441", banner: true },
    display: { featuredListingIds: ["a", "b"], showApp: true },
    websiteUrl: "https://dangg.live/",
  });
});

test("profile validation rejects unsafe or oversized input", () => {
  assert.throws(() => validateHouseProfile({ welcome: "x".repeat(281) }), HouseProfileError);
  assert.throws(() => validateHouseProfile({ decor: { theme: "neon" } }), HouseProfileError);
  assert.throws(() => validateHouseProfile({ decor: { accent: "red" } }), HouseProfileError);
  assert.throws(() => validateHouseProfile({ websiteUrl: "javascript:alert(1)" }), HouseProfileError);
  assert.throws(() => validateHouseProfile({ display: { featuredListingIds: Array(7).fill("a") } }), HouseProfileError);
  assert.throws(() => validateHouseProfile({ welcome: "<script>x</script>" }), HouseProfileError);
});

test("a partial profile only carries the fields supplied", () => {
  assert.deepEqual(validateHouseProfile({ welcome: "Hi" }), { welcome: "Hi" });
});
