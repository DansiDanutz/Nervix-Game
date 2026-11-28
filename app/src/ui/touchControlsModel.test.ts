import test from "node:test";
import assert from "node:assert/strict";
import { MOVE_ROWS, TURN_BUTTONS, padClassName, touchAction } from "./touchControlsModel.ts";

test("the D-pad is forward on top, then left, back, right", () => {
  assert.deepEqual(MOVE_ROWS.map((row) => row.map((b) => b.id)), [["forward"], ["left", "back", "right"]]);
});

test("turn buttons turn left then right, each with a spoken label", () => {
  assert.deepEqual(TURN_BUTTONS.map((b) => b.id), ["turnLeft", "turnRight"]);
  for (const b of [...MOVE_ROWS.flat(), ...TURN_BUTTONS]) assert.match(b.label, /\w/);
});

test("the button tables are frozen", () => {
  assert.ok(Object.isFrozen(MOVE_ROWS) && MOVE_ROWS.every((r) => Object.isFrozen(r)));
  assert.ok(Object.isFrozen(TURN_BUTTONS));
});

test("the action button: Exit inside, Enter with a door in reach, none otherwise", () => {
  assert.equal(touchAction(true, false), "exit");
  assert.equal(touchAction(true, true), "exit");
  assert.equal(touchAction(false, true), "enter");
  assert.equal(touchAction(false, false), null);
});

test("the pad is marked when a door is in reach (desktop shows it only then)", () => {
  assert.equal(padClassName(null), "touchpad");
  assert.equal(padClassName("enter"), "touchpad touchpad--door");
  assert.equal(padClassName("exit"), "touchpad touchpad--door");
});
