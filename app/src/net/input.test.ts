import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_PAD,
  isHeld,
  pressPad,
  pressTouch,
  releaseAllPad,
  releaseAllTouch,
  releasePad,
  releaseTouch,
  resetTouch,
  toggleRun,
  toggleTouchRun,
  touch,
  touchPad,
  withTouch,
} from "./input.ts";
import { driveFrom, frameDelta, groundSpeed, turnYaw, KEY_TURN_RATE, RUN_MULTIPLIER, WALK_SPEED } from "../input/movement.ts";

const FPS = 60;
const NO_KEYS: ReadonlySet<string> = new Set();

test("the empty pad holds nothing and does not run", () => {
  assert.equal(EMPTY_PAD.run, false);
  for (const b of ["forward", "back", "left", "right", "turnLeft", "turnRight"] as const) assert.equal(isHeld(EMPTY_PAD, b), false);
  assert.ok(Object.isFrozen(EMPTY_PAD));
});

test("pressing returns a new frozen pad and never mutates the old one", () => {
  const next = pressPad(EMPTY_PAD, 1, "forward");
  assert.notEqual(next, EMPTY_PAD);
  assert.ok(Object.isFrozen(next) && Object.isFrozen(next.held));
  assert.equal(isHeld(next, "forward"), true);
  assert.equal(isHeld(EMPTY_PAD, "forward"), false);
});

test("release is per pointer: a second finger on the same button keeps it held", () => {
  const two = pressPad(pressPad(EMPTY_PAD, 1, "forward"), 2, "forward");
  const one = releasePad(two, 1);
  assert.equal(isHeld(one, "forward"), true);
  assert.equal(isHeld(releasePad(one, 2), "forward"), false);
});

test("a pointer holds one button: pressing another with the same id moves the hold", () => {
  const pad = pressPad(pressPad(EMPTY_PAD, 7, "forward"), 7, "left");
  assert.equal(isHeld(pad, "forward"), false);
  assert.equal(isHeld(pad, "left"), true);
});

test("invalid pointer ids and unknown buttons are ignored", () => {
  assert.equal(pressPad(EMPTY_PAD, Number.NaN, "forward"), EMPTY_PAD);
  assert.equal(pressPad(EMPTY_PAD, 1, "jump" as never), EMPTY_PAD);
  assert.equal(releasePad(EMPTY_PAD, 99), EMPTY_PAD);
});

test("releasing all holds keeps the run toggle (it is a mode, not a hold)", () => {
  const pad = toggleRun(pressPad(pressPad(EMPTY_PAD, 1, "forward"), 2, "turnLeft"));
  const released = releaseAllPad(pad);
  assert.equal(isHeld(released, "forward"), false);
  assert.equal(isHeld(released, "turnLeft"), false);
  assert.equal(released.run, true);
  assert.equal(toggleRun(released).run, false);
});

test("withTouch adds the run toggle and the turn buttons to the keyboard drive", () => {
  const walk = driveFrom(NO_KEYS, { forward: true, back: false, left: false, right: false });
  const run = withTouch(walk, toggleRun(EMPTY_PAD));
  assert.equal(run.run, true);
  assert.equal(groundSpeed(run.run), WALK_SPEED * RUN_MULTIPLIER);
  assert.equal(withTouch(walk, pressPad(EMPTY_PAD, 1, "turnLeft")).turn, 1);
  assert.equal(withTouch(walk, pressPad(EMPTY_PAD, 1, "turnRight")).turn, -1);
  const both = pressPad(pressPad(EMPTY_PAD, 1, "turnLeft"), 2, "turnRight");
  assert.equal(withTouch(walk, both).turn, 0);
  assert.ok(Object.isFrozen(run));
});

test("keyboard turn and Shift win over the pad; the pad never cancels a key", () => {
  const keys = driveFrom(new Set(["q", "shift"]), { forward: false, back: false, left: false, right: false });
  const merged = withTouch(keys, pressPad(EMPTY_PAD, 1, "turnRight"));
  assert.equal(merged.turn, 1);
  assert.equal(merged.run, true);
});

test("the shared touch object reads the live store, so the controller sees pad holds", () => {
  resetTouch();
  pressTouch(3, "forward");
  assert.equal(touch.forward, true);
  assert.equal(driveFrom(NO_KEYS, touch).forward, 1);
  releaseTouch(3);
  assert.equal(touch.forward, false);
  assert.equal(driveFrom(NO_KEYS, touch).forward, 0);
});

test("pointercancel (released by pointer id) stops movement", () => {
  resetTouch();
  pressTouch(4, "back");
  assert.equal(driveFrom(NO_KEYS, touch).forward, -1);
  releaseTouch(4); // TouchControls calls this for pointerup, pointercancel and lostpointercapture
  assert.equal(driveFrom(NO_KEYS, touch).forward, 0);
});

test("touch cannot be written directly (all writes go through the store)", () => {
  assert.throws(() => {
    (touch as { forward: boolean }).forward = true;
  });
});

test("the store notifies subscribers once per change and stops after unsubscribe", () => {
  resetTouch();
  let calls = 0;
  const off = touchPad.subscribe(() => calls++);
  toggleTouchRun();
  assert.equal(touchPad.get().run, true);
  releaseTouch(123); // no hold: no change, no notification
  assert.equal(calls, 1);
  off();
  toggleTouchRun();
  assert.equal(calls, 1);
  resetTouch();
});

test("releaseAllTouch (blur, hidden tab) clears holds; resetTouch also clears run", () => {
  resetTouch();
  pressTouch(1, "left");
  toggleTouchRun();
  releaseAllTouch();
  assert.equal(touch.left, false);
  assert.equal(touchPad.get().run, true);
  resetTouch();
  assert.equal(touchPad.get(), EMPTY_PAD);
});

test("holding the forward pad for 1 s walks 4.2 m; with run on it covers 1.7x", () => {
  const distance = (pad: typeof EMPTY_PAD) => {
    const drive = withTouch(driveFrom(NO_KEYS, { forward: isHeld(pad, "forward"), back: false, left: false, right: false }), pad);
    let d = 0;
    for (let i = 0; i < FPS; i++) d += Math.abs(drive.forward) * groundSpeed(drive.run) * frameDelta(1 / FPS);
    return d;
  };
  const walk = distance(pressPad(EMPTY_PAD, 1, "forward"));
  assert.ok(Math.abs(walk - WALK_SPEED) < 1e-6);
  assert.ok(walk > 1, "the forward pad moves more than 1 m");
  const run = distance(toggleRun(pressPad(EMPTY_PAD, 1, "forward")));
  assert.ok(Math.abs(run / walk - RUN_MULTIPLIER) < 1e-6);
});

test("holding a turn button for 1 s turns about +-1.8 rad, like Q and R", () => {
  const yawAfter = (pad: typeof EMPTY_PAD) => {
    const drive = withTouch(driveFrom(NO_KEYS, touch), pad);
    let yaw = 0;
    for (let i = 0; i < FPS; i++) yaw = turnYaw(yaw, drive.turn, frameDelta(1 / FPS));
    return yaw;
  };
  assert.ok(Math.abs(yawAfter(pressPad(EMPTY_PAD, 1, "turnLeft")) - KEY_TURN_RATE) < 1e-6);
  assert.ok(Math.abs(yawAfter(pressPad(EMPTY_PAD, 1, "turnRight")) + KEY_TURN_RATE) < 1e-6);
});
