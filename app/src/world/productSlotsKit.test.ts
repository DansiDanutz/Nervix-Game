import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DISPLAY_LABEL, fitScale, k3NodeName, parseK3, productInstances } from "./productSlotsKit.ts";
import { assignListingsToSlots, GENERIC_CATEGORY } from "./productSlots.ts";
import { interiorTemplate, parseK2 } from "./interiorTemplate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = JSON.parse(readFileSync(join(HERE, "../../public/kits/k3/manifest.json"), "utf8"));
const CONTRACT = JSON.parse(readFileSync(join(HERE, "../../../shared/contracts/product-categories.json"), "utf8"));
const KIT = parseK3(RAW);
const K2 = parseK2(JSON.parse(readFileSync(join(HERE, "../../public/kits/k2/manifest.json"), "utf8")));
const SLOTS = interiorTemplate(K2.houses[0]).displaySlots;

test("the runtime label is the display-only demo wording", () => {
  assert.equal(DISPLAY_LABEL, "demo · display only");
});

test("parseK3 covers every contract category plus the generic fallback", () => {
  assert.equal(KIT.glb, "product_kit.glb");
  assert.deepEqual([...KIT.categoryIds].sort(), CONTRACT.categories.map((c: { id: string }) => c.id).sort());
  assert.equal(KIT.fallback.id, GENERIC_CATEGORY);
  for (const id of [...KIT.categoryIds, GENERIC_CATEGORY]) {
    const c = KIT.byId(id);
    assert.equal(c.productNode, `display.${id}.product`);
    assert.equal(c.productSize.length, 3);
  }
  assert.equal(KIT.byId("spaceship"), KIT.fallback);
  assert.ok(Object.isFrozen(KIT) && Object.isFrozen(KIT.categoryIds));
});

test("parseK3 rejects a bad manifest with the failing path", () => {
  assert.throws(() => parseK3({ ...RAW, glb: "../evil.glb" }), /k3 manifest: glb/);
  assert.throws(() => parseK3({ ...RAW, categories: [{ ...RAW.categories[0], product_size_m: [1, 2] }] }), /categories\[0\]\.product_size_m/);
  assert.throws(() => parseK3({ ...RAW, fallback: null }), /fallback/);
  assert.throws(() => parseK3(null), /root/);
});

test("k3NodeName mirrors three.js node-name sanitising", () => {
  assert.equal(k3NodeName("display.seat.product"), "displayseatproduct");
  assert.equal(k3NodeName("a b[c]:d/e"), "a_bcde");
});

test("fitScale shrinks a product into the slot extent and never enlarges it", () => {
  // product_size_m is (width, depth, height); slot max_extent is runtime (x, y-up, z).
  assert.equal(fitScale([0.5, 0.4, 0.3], [1, 1, 1]), 1);
  assert.equal(fitScale([0.56, 0.54, 0.86], [0.55, 0.5, 0.32]), 0.5 / 0.86, "height limits the seat");
  assert.equal(fitScale([0.2, 0.2, 1.0], [0.55, 0.5, 0.32]), 0.5);
  assert.equal(fitScale([0, 0, 0], [0.5, 0.5, 0.5]), 1);
});

test("productInstances groups placed listings by display category for instancing", () => {
  const layout = assignListingsToSlots(
    [
      { id: "s1", name: "a", category: "seat" },
      { id: "s2", name: "b", category: "seat" },
      { id: "x", name: "c", category: "spaceship" },
      { id: "m", name: "d", category: "merch" },
    ],
    SLOTS,
    { categories: KIT.categoryIds },
  );
  const groups = productInstances(layout, KIT);
  assert.deepEqual(groups.map((g) => g.category), [GENERIC_CATEGORY, "merch", "seat"]);
  const seat = groups.find((g) => g.category === "seat")!;
  assert.deepEqual(seat.items.map((i) => i.listingId), ["s1", "s2"]);
  assert.equal(seat.productNode, "display.seat.product");
  assert.deepEqual(seat.items[0].position, layout.placed[0].position);
  assert.ok(seat.items.every((i) => i.scale > 0 && i.scale <= 1));
  assert.ok(Object.isFrozen(groups) && Object.isFrozen(seat.items[0]));
});

test("productInstances of an empty layout is empty", () => {
  assert.deepEqual(productInstances(assignListingsToSlots([], SLOTS), KIT), []);
});
