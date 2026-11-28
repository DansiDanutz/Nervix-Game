import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPlaceStore, isKnownPlaceId, KNOWN_PLACE_IDS, PLAZA, placeId, placeKey, resetPlace } from "./place.ts";
import type { Place } from "../scene/slice.ts";

const door = { id: "bld_dangg", propertyId: "prop_dangg", owner: "usr_dangg", label: "DanGG", position: [0, 0, 0] as [number, number, number], colour: "#000", trim: "#fff" };
const house: Place = { kind: "house", door, from: "openpoker" };
const venue: Place = { kind: "venue", id: "openpoker" };

test("placeKey keeps the DOM/test contract: plaza, venue, house:<doorId>", () => {
  assert.equal(placeKey(PLAZA), "plaza");
  assert.equal(placeKey(venue), "venue");
  assert.equal(placeKey(house), "house:bld_dangg");
});

test("placeId maps a place to its shared contract id", () => {
  assert.equal(placeId(PLAZA), "plaza");
  assert.equal(placeId(venue), "openpoker");
  assert.equal(placeId(house), "prop_dangg");
});

test("KNOWN_PLACE_IDS matches shared/contracts/place-ids.json exactly", () => {
  const url = new URL("../../../shared/contracts/place-ids.json", import.meta.url);
  const contract = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as { places: { id: string }[] };
  assert.deepEqual([...KNOWN_PLACE_IDS], contract.places.map((p) => p.id));
});

test("isKnownPlaceId rejects unknown and non-string ids", () => {
  assert.equal(isKnownPlaceId("prop_test"), true);
  assert.equal(isKnownPlaceId("prop_nope"), false);
  assert.equal(isKnownPlaceId(""), false);
  assert.equal(isKnownPlaceId(42), false);
});

test("the place store starts on the plaza and notifies subscribers on change", () => {
  const store = createPlaceStore();
  assert.equal(store.get(), PLAZA);
  const seen: string[] = [];
  const off = store.subscribe(() => seen.push(placeKey(store.get())));
  store.set(venue);
  store.set(house);
  off();
  store.set(PLAZA);
  assert.deepEqual(seen, ["venue", "house:bld_dangg"]);
});

test("setting the same place object does not notify", () => {
  const store = createPlaceStore(venue);
  let calls = 0;
  store.subscribe(() => calls++);
  store.set(venue);
  assert.equal(calls, 0);
});

test("the plaza constant is frozen", () => {
  assert.equal(Object.isFrozen(PLAZA), true);
});

test("resetPlace returns a store to the plaza (App mount after a dev HMR remount)", () => {
  const store = createPlaceStore({ kind: "venue", id: "openpoker" } as Place);
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  resetPlace(store);
  assert.equal(store.get(), PLAZA);
  assert.equal(calls, 1);
  resetPlace(store);
  assert.equal(calls, 1, "already on the plaza: no notification, so a production first mount is a no-op");
});
