import test from "node:test";
import assert from "node:assert/strict";
import type { Place } from "../scene/slice.ts";
import type { Target } from "./targets.ts";
import type { HouseDoor } from "../scene/HouseDoors.ts";
import { createAnnouncer, nextAnnouncement, placeAnnouncement, targetAnnouncement, worldFocus } from "./announce.ts";

const door = { id: "bld_dangg", label: "DanGG", propertyId: "prop_dangg" } as unknown as HouseDoor;
const PLAZA: Place = { kind: "plaza" };
const SALON: Place = { kind: "venue", id: "openpoker" };
const HOUSE: Place = { kind: "house", door, from: "openpoker" };
const VENUE_DOOR: Target = { kind: "venue", label: "OpenPoker" };
const HOUSE_DOOR: Target = { kind: "house", door, label: "DanGG" };
const EXIT: Target = { kind: "exit", label: "Plaza" };

test("door targets read as the action they offer", () => {
  assert.equal(targetAnnouncement(VENUE_DOOR), "Enter OpenPoker");
  assert.equal(targetAnnouncement(HOUSE_DOOR), "Enter DanGG");
  assert.equal(targetAnnouncement(EXIT), "Exit to Plaza");
  assert.equal(targetAnnouncement(null), null);
});

test("places read as where the player now is", () => {
  assert.equal(placeAnnouncement(PLAZA), "On the plaza");
  assert.equal(placeAnnouncement(SALON), "Inside the OpenPoker salon");
  assert.equal(placeAnnouncement(HOUSE), "Inside DanGG");
});

test("nothing is announced on the first frame or when nothing changed", () => {
  const f = worldFocus(PLAZA, null);
  assert.equal(nextAnnouncement(null, f), null);
  assert.equal(nextAnnouncement(f, worldFocus(PLAZA, null)), null);
  assert.ok(Object.isFrozen(f));
});

test("reaching a door announces it; walking away is silent", () => {
  const away = worldFocus(PLAZA, null);
  const atDoor = worldFocus(PLAZA, VENUE_DOOR);
  assert.equal(nextAnnouncement(away, atDoor), "Enter OpenPoker");
  assert.equal(nextAnnouncement(atDoor, worldFocus(PLAZA, VENUE_DOOR)), null, "staying at the door repeats nothing");
  assert.equal(nextAnnouncement(atDoor, away), null);
});

test("a place change wins over the door that was in reach", () => {
  const atDoor = worldFocus(PLAZA, VENUE_DOOR);
  assert.equal(nextAnnouncement(atDoor, worldFocus(SALON, null)), "Inside the OpenPoker salon");
  assert.equal(nextAnnouncement(worldFocus(SALON, HOUSE_DOOR), worldFocus(HOUSE, EXIT)), "Inside DanGG");
  assert.equal(nextAnnouncement(worldFocus(HOUSE, EXIT), worldFocus(PLAZA, VENUE_DOOR)), "On the plaza");
});

test("the announcer bumps a sequence so the same text is read again", () => {
  const a = createAnnouncer();
  assert.deepEqual(a.get(), { text: "", seq: 0 });
  let calls = 0;
  const off = a.subscribe(() => { calls += 1; });
  a.announce("Enter OpenPoker");
  const first = a.get();
  a.announce("Enter OpenPoker");
  assert.equal(a.get().text, "Enter OpenPoker");
  assert.equal(a.get().seq, first.seq + 1);
  assert.notEqual(a.get(), first, "a new frozen snapshot each time");
  assert.ok(Object.isFrozen(a.get()));
  a.announce("   ");
  assert.equal(calls, 2, "blank text is ignored");
  off();
  a.announce("On the plaza");
  assert.equal(calls, 2);
});
