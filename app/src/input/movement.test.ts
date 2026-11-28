import test from "node:test";
import assert from "node:assert/strict";
import { driveFrom, frameDelta, groundSpeed, KEY_TURN_RATE, RUN_MULTIPLIER, turnYaw, WALK_SPEED } from "./movement.ts";

const NO_TOUCH = Object.freeze({ forward: false, back: false, left: false, right: false });
const FPS = 60;

/** Distance covered holding the keys for `seconds`, frame by frame as the controller does. */
function distanceHeld(keys: string[], seconds: number) {
  const drive = driveFrom(new Set(keys), NO_TOUCH);
  let d = 0;
  for (let i = 0; i < seconds * FPS; i++) d += Math.abs(drive.forward) * groundSpeed(drive.run) * frameDelta(1 / FPS);
  return d;
}

function yawHeld(keys: string[], seconds: number) {
  const drive = driveFrom(new Set(keys), NO_TOUCH);
  let yaw = 0;
  for (let i = 0; i < seconds * FPS; i++) yaw = turnYaw(yaw, drive.turn, frameDelta(1 / FPS));
  return yaw;
}

test("run and turn tuning are named constants", () => {
  assert.equal(WALK_SPEED, 4.2);
  assert.equal(RUN_MULTIPLIER, 1.7);
  assert.equal(KEY_TURN_RATE, 1.8);
});

test("Shift+W covers 1.6-1.8 times the distance of W", () => {
  const ratio = distanceHeld(["shift", "w"], 1) / distanceHeld(["w"], 1);
  assert.ok(ratio >= 1.6 && ratio <= 1.8, `ratio ${ratio}`);
  assert.ok(Math.abs(distanceHeld(["w"], 1) - WALK_SPEED) < 1e-6);
});

test("the run ratio holds at a slow frame rate (clamped delta)", () => {
  const drive = driveFrom(new Set(["w"]), NO_TOUCH);
  const run = driveFrom(new Set(["w", "shift"]), NO_TOUCH);
  const dt = frameDelta(0.2);
  assert.equal(dt, 0.05);
  const ratio = (groundSpeed(run.run) * dt) / (groundSpeed(drive.run) * dt);
  assert.ok(ratio >= 1.6 && ratio <= 1.8);
});

test("holding Q for 1 s turns about +1.8 rad, R about -1.8 rad, both cancel", () => {
  assert.ok(Math.abs(yawHeld(["q"], 1) - 1.8) < 0.01);
  assert.ok(Math.abs(yawHeld(["r"], 1) + 1.8) < 0.01);
  assert.equal(yawHeld(["q", "r"], 1), 0);
});

test("WASD, arrows and touch map to forward and strafe; opposite keys cancel", () => {
  assert.deepEqual(driveFrom(new Set(["w", "d"]), NO_TOUCH), { forward: 1, strafe: 1, run: false, turn: 0 });
  assert.deepEqual(driveFrom(new Set(["arrowdown", "arrowleft"]), NO_TOUCH), { forward: -1, strafe: -1, run: false, turn: 0 });
  assert.equal(driveFrom(new Set(["w", "s"]), NO_TOUCH).forward, 0);
  assert.equal(driveFrom(new Set(), { ...NO_TOUCH, forward: true }).forward, 1);
  assert.equal(driveFrom(new Set(), { ...NO_TOUCH, right: true }).strafe, 1);
});

test("frameDelta clamps long frames and rejects bad input", () => {
  assert.equal(frameDelta(0.016), 0.016);
  assert.equal(frameDelta(5), 0.05);
  assert.equal(frameDelta(-1), 0);
  assert.equal(frameDelta(Number.NaN), 0);
});
