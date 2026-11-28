import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assignListingsToSlots, compareListingNames, DEFAULT_CATEGORY_IDS, displayCategory, GENERIC_CATEGORY, type DisplayListing } from "./productSlots.ts";
import { interiorTemplate, parseK2 } from "./interiorTemplate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const K2 = parseK2(JSON.parse(readFileSync(join(HERE, "../../public/kits/k2/manifest.json"), "utf8")));
const SLOTS = interiorTemplate(K2.houses[0]).displaySlots;
const KNOWN = ["seat", "bundle", "digital", "drink", "food", "merch", "service"];

const L = (id: string, extra: Partial<DisplayListing> = {}): DisplayListing => ({ id, name: id, ...extra });
const ids = (xs: readonly { listingId: string }[]) => xs.map((x) => x.listingId);
const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
};

test("an empty catalogue places nothing and overflows nothing", () => {
  const out = assignListingsToSlots([], SLOTS);
  assert.deepEqual(out.placed, []);
  assert.deepEqual(out.overflow, []);
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.placed) && Object.isFrozen(out.overflow));
});

test("a room with no slots sends every listing to the 2D overflow", () => {
  const out = assignListingsToSlots([L("a"), L("b")], []);
  assert.deepEqual(out.placed, []);
  assert.deepEqual(ids(out.overflow), ["a", "b"]);
});

test("explicit slot wins, then featured, then sort order, then name", () => {
  const listings = [
    L("n_zed", { name: "Zed" }),
    L("n_amy", { name: "amy" }),
    L("sorted", { name: "Yak", sortOrder: -5 }),
    L("feat2", { name: "Feat two" }),
    L("feat1", { name: "Feat one", sortOrder: 99 }),
    L("pinned", { name: "Pinned", slot: 3, sortOrder: 50 }),
  ];
  const out = assignListingsToSlots(listings, SLOTS, { featuredIds: ["feat1", "feat2"] });
  assert.equal(out.placed.find((p) => p.listingId === "pinned")?.slotNode, SLOTS[3].node);
  assert.equal(out.placed.find((p) => p.listingId === "pinned")?.reason, "explicit");
  const fillOrder = out.placed.filter((p) => p.reason === "fill").sort((a, b) => a.slotPosition - b.slotPosition);
  assert.deepEqual(ids(fillOrder), ["feat1", "feat2", "sorted", "n_amy", "n_zed"]);
  assert.deepEqual(fillOrder.map((p) => p.slotPosition), [0, 1, 2, 4, 5]);
  assert.equal(fillOrder[0].featured, true);
  assert.equal(fillOrder[2].featured, false);
});

test("featured order follows the featured id list", () => {
  const out = assignListingsToSlots([L("a"), L("b"), L("c")], SLOTS, { featuredIds: ["c", "a"] });
  assert.deepEqual(ids(out.placed), ["c", "a", "b"]);
});

test("the placed slot carries the template position and extent", () => {
  const [p] = assignListingsToSlots([L("a", { slot: 2 })], SLOTS).placed;
  assert.deepEqual(p.position, SLOTS[2].position);
  assert.deepEqual(p.maxExtent, SLOTS[2].maxExtent);
  assert.equal(p.slotNode, SLOTS[2].node);
});

test("more listings than slots: the rest stay 2D-only, in fill order", () => {
  const listings = Array.from({ length: SLOTS.length + 3 }, (_, i) => L(`l${String(i).padStart(2, "0")}`));
  const out = assignListingsToSlots(listings, SLOTS);
  assert.equal(out.placed.length, SLOTS.length);
  assert.deepEqual(ids(out.overflow), listings.slice(SLOTS.length).map((l) => l.id));
  for (const o of out.overflow) assert.equal("position" in o, false, "overflow entries have no 3D position");
});

test("a contested slot goes to the server's winner (sort order, name, id); the loser is refilled", () => {
  const out = assignListingsToSlots([L("b", { slot: 1, sortOrder: 0 }), L("a", { slot: 1, sortOrder: 0 }), L("c", { slot: 1, sortOrder: -1 })], SLOTS);
  assert.equal(out.placed.find((p) => p.slotPosition === 1)?.listingId, "c");
  assert.deepEqual(ids(out.placed.filter((p) => p.reason === "fill")), ["a", "b"]);
  assert.deepEqual(out.placed.filter((p) => p.reason === "fill").map((p) => p.slotPosition), [0, 2]);
});

test("an explicit slot the room does not have falls back to filling, not to loss", () => {
  const out = assignListingsToSlots([L("far", { slot: 31 }), L("neg", { slot: -1 }), L("frac", { slot: 1.5 })], SLOTS);
  assert.deepEqual(ids(out.placed), ["far", "frac", "neg"]);
  assert.ok(out.placed.every((p) => p.reason === "fill"));
});

test("inactive listings never reach the room or the overflow", () => {
  const out = assignListingsToSlots([L("off", { active: false, slot: 0 }), L("on")], SLOTS);
  assert.deepEqual(ids(out.placed), ["on"]);
  assert.equal(out.placed[0].slotPosition, 0);
  assert.deepEqual(out.overflow, []);
});

test("a duplicate listing id is placed once", () => {
  const out = assignListingsToSlots([L("x", { sortOrder: 2 }), L("x", { sortOrder: 1, name: "x again" })], SLOTS);
  assert.equal(out.placed.length, 1);
  assert.equal(out.placed[0].name, "x again");
});

test("unknown, missing or null categories fall back to the generic display", () => {
  const out = assignListingsToSlots([L("a", { category: "seat" }), L("b", { category: "spaceship" }), L("c", { category: null }), L("d")], SLOTS, { categories: KNOWN });
  assert.deepEqual(out.placed.map((p) => p.displayCategory), ["seat", GENERIC_CATEGORY, GENERIC_CATEGORY, GENERIC_CATEGORY]);
  assert.equal(out.placed[1].category, "spaceship", "the raw category is kept for the 2D card");
  assert.equal(displayCategory("drink", KNOWN), "drink");
  assert.equal(displayCategory("__proto__", KNOWN), GENERIC_CATEGORY);
  assert.equal(displayCategory("seat", []), GENERIC_CATEGORY);
});

test("same input set in any order gives the same layout", () => {
  const listings = [L("a", { sortOrder: 1 }), L("b", { slot: 4 }), L("c", { name: "C" }), L("d", { slot: 4, sortOrder: -1 }), L("e")];
  const base = JSON.stringify(assignListingsToSlots(listings, SLOTS, { featuredIds: ["e"] }));
  for (const order of [[4, 3, 2, 1, 0], [2, 0, 4, 1, 3], [1, 4, 0, 3, 2]]) {
    assert.equal(JSON.stringify(assignListingsToSlots(order.map((i) => listings[i]), SLOTS, { featuredIds: ["e"] })), base);
  }
});

test("inputs are not mutated and outputs are frozen", () => {
  const listings = deepFreeze([L("a", { slot: 0 }), L("b")]);
  const slots = deepFreeze([...SLOTS]);
  const featuredIds = deepFreeze(["b"]);
  const before = JSON.stringify({ listings, slots, featuredIds });
  const out = assignListingsToSlots(listings, slots, { featuredIds });
  assert.equal(JSON.stringify({ listings, slots, featuredIds }), before);
  assert.ok(out.placed.every((p) => Object.isFrozen(p)));
  assert.ok(Object.isFrozen(out.overflow));
  assert.throws(() => {
    (out.placed as unknown as unknown[]).push({});
  }, TypeError);
});

test("name order matches the server rule: lower-case code units, then raw code units", () => {
  const names = ["b", "B", "a", "Ä", "A", "ab"];
  assert.deepEqual([...names].sort(compareListingNames), ["A", "a", "ab", "B", "b", "Ä"]);
});

test("the name rule is the server's compareListingNames", async () => {
  const server = await import(new URL("../../../server/src/listing-display.mjs", import.meta.url).href);
  const names = ["Zeta", "alpha", "Alpha", "ß", "beta", "Émile", "émile", "10", "9", ""];
  assert.deepEqual([...names].sort(compareListingNames), [...names].sort(server.compareListingNames));
});

test("the default category ids mirror the frozen product-categories contract", () => {
  const contract = JSON.parse(readFileSync(join(HERE, "../../../shared/contracts/product-categories.json"), "utf8"));
  assert.deepEqual([...DEFAULT_CATEGORY_IDS], contract.categories.map((c: { id: string }) => c.id));
  assert.equal(displayCategory("merch"), "merch");
});
