/**
 * P1 listing display, pure parts: category/slot/sort/active validation in
 * newOffering and offeringPatch, deterministic arrangement (slot collisions),
 * visitor filtering, featured ids checked against the house, and the
 * welcome:null fix. The migration's CHECK must list exactly the contract ids.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { newOffering, offeringPatch } from "../src/routes/offering-input.mjs";
import { CATEGORY_IDS, DISPLAY_SLOT_MAX, SORT_ORDER_LIMIT, arrangeListings, visibleListings, compareListingNames } from "../src/listing-display.mjs";
import { ownFeaturedIds } from "../src/routes/houses.mjs";
import { validateHouseProfile, checkFeaturedListings, HouseProfileError } from "../src/house-authority.mjs";

const contract = JSON.parse(readFileSync(new URL("../../shared/contracts/product-categories.json", import.meta.url), "utf8"));
const migration = readFileSync(new URL("../db/migrations/018_listing_display.sql", import.meta.url), "utf8");
const BASE = Object.freeze({ name: "Seat", priceMinor: 100 });
const listing = (id, extra = {}) => Object.freeze({ id, name: id, slot: null, sortOrder: 0, active: true, ...extra });

test("category ids come from the frozen contract", () => {
  assert.deepEqual([...CATEGORY_IDS], contract.categories.map((c) => c.id));
  assert.ok(Object.isFrozen(CATEGORY_IDS));
});

test("migration 018 CHECKs category against exactly the contract ids", () => {
  const check = /category\s+IN\s*\(([^)]*)\)/i.exec(migration);
  assert.ok(check, "category CHECK present");
  const ids = check[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(ids.sort(), [...CATEGORY_IDS].sort());
  assert.match(migration, new RegExp(`display_slot\\s+BETWEEN\\s+0\\s+AND\\s+${DISPLAY_SLOT_MAX}`, "i"));
  assert.match(migration, new RegExp(`sort_order\\s+BETWEEN\\s+-${SORT_ORDER_LIMIT}\\s+AND\\s+${SORT_ORDER_LIMIT}`, "i"));
});

test("newOffering defaults: no category, no slot, sort 0, active", () => {
  const { offering } = newOffering(BASE, "bld_x");
  assert.equal(offering.category, null);
  assert.equal(offering.slot, null);
  assert.equal(offering.sortOrder, 0);
  assert.equal(offering.active, true);
});

test("newOffering accepts valid display fields", () => {
  const { offering } = newOffering({ ...BASE, category: "seat", slot: 3, sortOrder: -5, active: false }, "bld_x");
  assert.deepEqual([offering.category, offering.slot, offering.sortOrder, offering.active], ["seat", 3, -5, false]);
});

test("newOffering rejects an invalid category, slot, sort order or active flag", () => {
  const cases = [
    [{ category: "weapon" }, "invalid_category"],
    [{ category: "SEAT" }, "invalid_category"],
    [{ category: 7 }, "invalid_category"],
    [{ slot: -1 }, "invalid_slot"],
    [{ slot: DISPLAY_SLOT_MAX + 1 }, "invalid_slot"],
    [{ slot: 1.5 }, "invalid_slot"],
    [{ slot: "2" }, "invalid_slot"],
    [{ sortOrder: SORT_ORDER_LIMIT + 1 }, "invalid_sort_order"],
    [{ sortOrder: "x" }, "invalid_sort_order"],
    [{ active: "no" }, "invalid_active"],
  ];
  for (const [extra, error] of cases) assert.equal(newOffering({ ...BASE, ...extra }, "b").error, error, JSON.stringify(extra));
});

test("offeringPatch validates display fields and allows clearing category and slot", () => {
  assert.deepEqual(offeringPatch({ category: "food", slot: 0, sortOrder: 2, active: false }).patch,
    { category: "food", slot: 0, sortOrder: 2, active: false });
  assert.deepEqual(offeringPatch({ category: null, slot: null }).patch, { category: null, slot: null });
  assert.equal(offeringPatch({ category: "nope" }).error, "invalid_category");
  assert.equal(offeringPatch({ slot: 99 }).error, "invalid_slot");
  assert.equal(offeringPatch({ sortOrder: null }).error, "invalid_sort_order");
  assert.equal(offeringPatch({ active: null }).error, "invalid_active");
  assert.deepEqual(offeringPatch({}).patch, {});
});

test("arrangeListings: slotted first by slot, then sort order, name, id", () => {
  const input = [listing("c", { sortOrder: 1 }), listing("b", { slot: 2 }), listing("a"), listing("d", { slot: 0 })];
  assert.deepEqual(arrangeListings(input).map((l) => l.id), ["d", "b", "a", "c"]);
});

test("a slot collision resolves deterministically, whatever the input order", () => {
  const x = listing("off_x", { slot: 1, sortOrder: 2 });
  const y = listing("off_y", { slot: 1, sortOrder: 1 });
  const z = listing("off_z", { slot: 1, sortOrder: 1 });
  for (const order of [[x, y, z], [z, y, x], [y, x, z]]) {
    const out = arrangeListings(order);
    assert.deepEqual(out.map((l) => [l.id, l.slot]), [["off_y", 1], ["off_z", null], ["off_x", null]]);
  }
});

test("inactive listings never claim a slot and sort after active ones", () => {
  const out = arrangeListings([listing("old", { slot: 1, active: false }), listing("new", { slot: 1 })]);
  assert.deepEqual(out.map((l) => [l.id, l.slot, l.active]), [["new", 1, true], ["old", 1, false]]);
});

test("arrangeListings and visibleListings do not mutate their input", () => {
  const input = Object.freeze([listing("b", { slot: 1 }), listing("a", { slot: 1, active: false })]);
  const out = visibleListings(input);
  assert.deepEqual(out.map((l) => l.id), ["b"]);
  assert.equal(input[0].id, "b");
  assert.ok(Object.isFrozen(arrangeListings(input)));
  assert.deepEqual(arrangeListings([]), []);
});

test("featured ids must be the house's own listings", () => {
  assert.doesNotThrow(() => checkFeaturedListings({ featuredListingIds: ["a"] }, ["a", "b"]));
  assert.doesNotThrow(() => checkFeaturedListings(undefined, ["a"]));
  assert.doesNotThrow(() => checkFeaturedListings({ showApp: true }, []));
  assert.throws(() => checkFeaturedListings({ featuredListingIds: ["a", "off_foreign"] }, ["a"]), HouseProfileError);
});

test("a cleared welcome is null, not the string \"null\"", () => {
  assert.deepEqual(validateHouseProfile({ welcome: null }), { welcome: null });
  assert.deepEqual(validateHouseProfile({ welcome: "Hi" }), { welcome: "Hi" });
});

test("names compare case-folded first, then by raw code units (the rule P3 must copy)", () => {
  const names = ["banana", "Banana", "apple", "Cherry", "Apple"];
  assert.deepEqual([...names].sort(compareListingNames), ["Apple", "apple", "Banana", "banana", "Cherry"]);
  assert.equal(compareListingNames("a", "a"), 0);
});

test("arrangeListings orders mixed-case names case-insensitively", () => {
  const input = [listing("1", { name: "Banana" }), listing("2", { name: "apple" }), listing("3", { name: "cherry" })];
  assert.deepEqual(arrangeListings(input).map((l) => l.name), ["apple", "Banana", "cherry"]);
});

test("offeringPatch treats description:null as a clear, not the string \"null\"", () => {
  assert.deepEqual(offeringPatch({ description: null }).patch, { description: null });
  assert.deepEqual(offeringPatch({ description: "Hi" }).patch, { description: "Hi" });
});

test("ownFeaturedIds drops featured ids that are not the house's own listings", () => {
  const display = Object.freeze({ showApp: true, featuredListingIds: Object.freeze(["a", "off_foreign", "b"]) });
  assert.deepEqual(ownFeaturedIds(display, ["a", "b"]), { showApp: true, featuredListingIds: ["a", "b"] });
  assert.deepEqual(display.featuredListingIds, ["a", "off_foreign", "b"]);
  assert.deepEqual(ownFeaturedIds({ showApp: true }, ["a"]), { showApp: true });
  assert.equal(ownFeaturedIds(null, ["a"]), null);
});
