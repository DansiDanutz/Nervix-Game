import test from "node:test";
import assert from "node:assert/strict";
import { houseDisplay, type HouseDisplaySource } from "./productSlotsHouse.ts";

const house = (listings: HouseDisplaySource["listings"], featured?: string[]): HouseDisplaySource => ({
  propertyId: "prop_test",
  listings,
  profile: { display: featured ? { featuredListingIds: featured } : {} },
});

test("no house yet → no display (nothing drawn, no fetch of its own)", () => {
  assert.equal(houseDisplay(null), null);
  assert.equal(houseDisplay(undefined), null);
});

test("the display is the panel's house: its listings and featured ids, frozen", () => {
  const listings = [{ id: "a", name: "A", category: "drink", slot: 1 }, { id: "b", name: "B" }];
  const d = houseDisplay(house(listings, ["b"]))!;
  assert.equal(d.propertyId, "prop_test");
  assert.deepEqual(d.listings.map((l) => l.id), ["a", "b"]);
  assert.deepEqual(d.featuredIds, ["b"]);
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.listings) && Object.isFrozen(d.featuredIds));
});

test("missing featured ids read as none", () => {
  assert.deepEqual(houseDisplay(house([]))!.featuredIds, []);
});

test("a reloaded house (after an owner edit) gives a new display with the new listings", () => {
  const before = houseDisplay(house([{ id: "a", name: "A" }]))!;
  const after = houseDisplay(house([{ id: "a", name: "A" }, { id: "n", name: "New", category: "drink", slot: 0 }]))!;
  assert.notEqual(before, after);
  assert.deepEqual(after.listings.map((l) => l.id), ["a", "n"]);
});

test("the input house is not modified", () => {
  const h = house([{ id: "a", name: "A" }], ["a"]);
  const snapshot = JSON.stringify(h);
  houseDisplay(h);
  assert.equal(JSON.stringify(h), snapshot);
});
