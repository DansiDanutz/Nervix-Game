import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHouseSnapshotStore, houseFor } from "./houseSnapshot.ts";

const house = (propertyId: string, n = 1) => Object.freeze({ propertyId, listings: Object.freeze(Array.from({ length: n }, (_, i) => ({ id: `l${i}` }))) });

test("the store holds the latest house the panel reported and notifies readers", () => {
  const store = createHouseSnapshotStore<ReturnType<typeof house>>();
  let calls = 0;
  const off = store.subscribe(() => (calls += 1));
  store.set(house("prop_a"));
  store.set(house("prop_a", 2));
  assert.equal(store.get()?.listings.length, 2);
  assert.equal(calls, 2);
  off();
  store.set(null);
  assert.equal(calls, 2);
  assert.equal(store.get(), null);
});

test("a reader sees a house only for its own property (never a stale one from the last room)", () => {
  const store = createHouseSnapshotStore<ReturnType<typeof house>>();
  store.set(house("prop_a"));
  assert.equal(houseFor(store.get(), "prop_a")?.propertyId, "prop_a");
  assert.equal(houseFor(store.get(), "prop_b"), null);
  assert.equal(houseFor(null, "prop_a"), null);
});

test("setting the same object again does not notify", () => {
  const store = createHouseSnapshotStore<ReturnType<typeof house>>();
  const h = house("prop_a");
  let calls = 0;
  store.subscribe(() => (calls += 1));
  store.set(h);
  store.set(h);
  assert.equal(calls, 1);
});

test("a failed reload clears the snapshot: the room never draws the last visit's listings", () => {
  const store = createHouseSnapshotStore<ReturnType<typeof house>>();
  store.set(house("prop_a", 3));
  // InteriorCatalog reports null when GET /houses/:id fails (merchant suspended, listing hidden).
  store.set(null);
  assert.equal(houseFor(store.get(), "prop_a"), null);
});

test("the house panel clears the shared snapshot on a failed load and when it leaves the house", () => {
  const src = readFileSync(new URL("../ui/InteriorCatalog.tsx", import.meta.url), "utf8");
  assert.match(src, /\.catch\(\(e\) => \{\s*if \(!alive\) return;[^;]*;\s*(\/\/[^\n]*\n\s*)?onHouse\?\.\(null\);\s*\}\)/, "a failed load must clear the 3D room's house");
  assert.match(src, /useEffect\(\(\) => \(\) => onHouse\?\.\(null\), \[door\.propertyId, onHouse\]\)/, "unmount or a new property clears it");
});
