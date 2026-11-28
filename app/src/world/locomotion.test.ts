import test from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_ENTER_SPEED, IDLE_EXIT_SPEED, MAX_GROUND_SPEED, MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, RUN_ENTER_SPEED, RUN_EXIT_SPEED,
  RUN_CLIP_SPEED, RUN_SPEED, TURN_MAX_RATE, WALK_CLIP_SPEED, WALK_MAX_PLAYBACK_RATE, WALK_SPEED, advanceGaitPhase, clipRates, gaitCycleRate, clipWeights, createLocomotion, nextState, stepLocomotion, turnToward,
  type Locomotion, type LocomotionSample,
} from "./locomotion.ts";
import { RUN_MULTIPLIER, WALK_SPEED as CT1_WALK_SPEED, groundSpeed } from "../input/movement.ts";
import { MAX_GROUND_SPEED as PLAYER_MAX_GROUND_SPEED } from "../player/playerState.ts";

const FRAME_MS = 1000 / 60;

/** Feed `frames` samples moving along +z at `speed` m/s, starting from `loco`. */
function drive(loco: Locomotion, speed: number, frames: number, dir: { x: number; z: number } = { x: 0, z: 1 }): Locomotion {
  let current = loco;
  for (let i = 0; i < frames; i += 1) {
    const last = current.last ?? { x: 0, z: 0, tMs: 0 };
    const step = (speed * FRAME_MS) / 1000;
    const sample: LocomotionSample = { x: last.x + dir.x * step, z: last.z + dir.z * step, tMs: last.tMs + FRAME_MS };
    current = stepLocomotion(current, sample);
  }
  return current;
}

const started = () => stepLocomotion(createLocomotion(), { x: 0, z: 0, tMs: 0 });
const sum = (w: { idle: number; walk: number; run: number }) => w.idle + w.walk + w.run;

test("reference speeds match the CT1 controller (walk, Shift run) and the playerState teleport cap", () => {
  assert.equal(WALK_SPEED, CT1_WALK_SPEED);
  assert.equal(RUN_SPEED, groundSpeed(true));
  assert.equal(RUN_SPEED, CT1_WALK_SPEED * RUN_MULTIPLIER);
  assert.equal(MAX_GROUND_SPEED, PLAYER_MAX_GROUND_SPEED);
});

test("thresholds are ordered with hysteresis: idle < walk < run, each band has a gap", () => {
  assert.ok(0 < IDLE_ENTER_SPEED && IDLE_ENTER_SPEED < IDLE_EXIT_SPEED && IDLE_EXIT_SPEED < WALK_SPEED);
  assert.ok(WALK_SPEED < RUN_EXIT_SPEED && RUN_EXIT_SPEED < RUN_ENTER_SPEED && RUN_ENTER_SPEED < RUN_SPEED);
});

test("nextState: walk starts above IDLE_EXIT and stops only below IDLE_ENTER", () => {
  assert.equal(nextState("idle", IDLE_EXIT_SPEED - 0.01), "idle");
  assert.equal(nextState("idle", IDLE_EXIT_SPEED + 0.01), "walk");
  assert.equal(nextState("walk", IDLE_ENTER_SPEED + 0.01), "walk");
  assert.equal(nextState("walk", IDLE_ENTER_SPEED - 0.01), "idle");
});

test("nextState: run starts above RUN_ENTER and drops back only below RUN_EXIT", () => {
  assert.equal(nextState("walk", RUN_ENTER_SPEED - 0.01), "walk");
  assert.equal(nextState("walk", RUN_ENTER_SPEED + 0.01), "run");
  assert.equal(nextState("run", RUN_EXIT_SPEED + 0.01), "run");
  assert.equal(nextState("run", RUN_EXIT_SPEED - 0.01), "walk");
  assert.equal(nextState("run", 0), "idle");
  assert.equal(nextState("idle", RUN_SPEED), "run");
});

test("clipWeights: pure clips at rest, walk speed and run speed; always sum to 1", () => {
  assert.deepEqual(clipWeights(0), { idle: 1, walk: 0, run: 0 });
  assert.deepEqual(clipWeights(WALK_SPEED), { idle: 0, walk: 1, run: 0 });
  assert.deepEqual(clipWeights(RUN_SPEED), { idle: 0, walk: 0, run: 1 });
  assert.deepEqual(clipWeights(RUN_SPEED * 2), { idle: 0, walk: 0, run: 1 });
  for (const s of [0.1, 1, 2.1, 3.9, 4.5, 5.67, 6.9, -3, Number.NaN]) {
    const w = clipWeights(s);
    assert.ok(Math.abs(sum(w) - 1) < 1e-9, `sum at ${s}`);
    assert.ok(Object.isFrozen(w));
  }
});

test("clipWeights blends linearly between neighbouring clips", () => {
  const half = clipWeights(WALK_SPEED / 2);
  assert.ok(Math.abs(half.idle - 0.5) < 1e-9 && Math.abs(half.walk - 0.5) < 1e-9 && half.run === 0);
  const mid = clipWeights((WALK_SPEED + RUN_SPEED) / 2);
  assert.ok(mid.idle === 0 && Math.abs(mid.walk - 0.5) < 1e-9 && Math.abs(mid.run - 0.5) < 1e-9);
});

test("clipRates: idle plays at 1; walk and run scale with speed inside the playback clamp", () => {
  const rest = clipRates(0);
  assert.equal(rest.idle, 1);
  assert.equal(rest.walk, MIN_PLAYBACK_RATE);
  assert.equal(rest.run, MIN_PLAYBACK_RATE);
  const fast = clipRates(RUN_SPEED * 3);
  assert.equal(fast.walk, WALK_MAX_PLAYBACK_RATE);
  assert.equal(fast.run, MAX_PLAYBACK_RATE);
  assert.ok(clipRates(2).walk < clipRates(3).walk, "walk speeds up with ground speed");
  assert.ok(Object.isFrozen(rest));
});

test("turnToward: shortest arc, capped at TURN_MAX_RATE, settles on the target", () => {
  const nearPi = turnToward(3.0, -3.0, 1 / 60);
  assert.ok(nearPi > 3.0, "turns through +pi, not the long way round");
  const capped = turnToward(0, 3, 1 / 60);
  assert.ok(capped > 0 && capped <= TURN_MAX_RATE / 60 + 1e-9);
  let yaw = 0;
  for (let i = 0; i < 120; i += 1) yaw = turnToward(yaw, 1.5, 1 / 60);
  assert.ok(Math.abs(yaw - 1.5) < 1e-3, `settled at ${yaw}`);
  assert.equal(turnToward(0.4, 0.4, 1 / 60), 0.4);
});

test("starts idle with full idle weight and the given heading", () => {
  const loco = createLocomotion(1.2);
  assert.equal(loco.state, "idle");
  assert.equal(loco.heading, 1.2);
  assert.deepEqual(loco.weights, { idle: 1, walk: 0, run: 0 });
  assert.ok(Object.isFrozen(loco));
});

test("holding W (walk speed) reaches walk within half a second; Shift+W reaches run", () => {
  const walking = drive(started(), WALK_SPEED, 30);
  assert.equal(walking.state, "walk");
  assert.ok(walking.weights.walk > 0.9, `walk weight ${walking.weights.walk}`);
  const running = drive(walking, RUN_SPEED, 30);
  assert.equal(running.state, "run");
  assert.ok(running.weights.run > 0.9, `run weight ${running.weights.run}`);
});

test("speed is smoothed: one frame of walking does not jump to full walk", () => {
  const one = drive(started(), WALK_SPEED, 1);
  assert.ok(one.speed > 0 && one.speed < WALK_SPEED / 2, `speed ${one.speed}`);
  assert.equal(one.state, "idle");
});

test("releasing W returns to idle", () => {
  const stopped = drive(drive(started(), WALK_SPEED, 30), 0, 40);
  assert.equal(stopped.state, "idle");
  assert.ok(stopped.weights.idle > 0.95);
});

test("heading follows the movement direction smoothly and holds when stopped", () => {
  const east = drive(started(), WALK_SPEED, 60, { x: 1, z: 0 });
  assert.ok(Math.abs(east.targetHeading - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(east.heading - Math.PI / 2) < 1e-3);
  const firstFrame = drive(started(), WALK_SPEED, 1, { x: 1, z: 0 });
  assert.ok(firstFrame.heading > 0 && firstFrame.heading < Math.PI / 2, "turns over several frames");
  const held = drive(east, 0, 30);
  assert.ok(Math.abs(held.targetHeading - Math.PI / 2) < 1e-9, "standing still keeps the last heading");
});

test("a teleport (door transition) reads as idle, never a one-frame run burst", () => {
  const walking = drive(started(), WALK_SPEED, 30);
  const last = walking.last as LocomotionSample;
  const jumped = stepLocomotion(walking, { x: last.x + 40, z: last.z, tMs: last.tMs + FRAME_MS });
  assert.equal(jumped.speed, 0);
  assert.equal(jumped.state, "idle");
  assert.equal(jumped.heading, walking.heading, "a teleport does not spin the avatar");
});

test("ignores stale or invalid samples and never mutates its input", () => {
  const walking = drive(started(), WALK_SPEED, 10);
  const last = walking.last as LocomotionSample;
  assert.equal(stepLocomotion(walking, { ...last }), walking, "same timestamp");
  assert.equal(stepLocomotion(walking, { ...last, tMs: last.tMs - 5 }), walking, "older timestamp");
  assert.equal(stepLocomotion(walking, { x: Number.NaN, z: 0, tMs: last.tMs + 16 }), walking);
  assert.ok(Object.isFrozen(walking) && Object.isFrozen(walking.weights) && Object.isFrozen(walking.rates));
});

test("a long stall does not overshoot the smoothing", () => {
  const walking = drive(started(), WALK_SPEED, 30);
  const last = walking.last as LocomotionSample;
  const after = stepLocomotion(walking, { x: last.x, z: last.z + WALK_SPEED * 5, tMs: last.tMs + 5000 });
  assert.ok(after.speed <= WALK_SPEED + 1e-9 && after.speed >= 0);
});

test("walk clip is not clamped at the CT1 walking speed, so the feet do not slide", () => {
  // K1 walk is authored at 1.4 m/s; CT1 walks at 4.2 m/s: the stride must play 3x to cover the ground.
  const rate = clipRates(WALK_SPEED).walk;
  assert.equal(rate, WALK_SPEED / WALK_CLIP_SPEED);
  assert.ok(rate < WALK_MAX_PLAYBACK_RATE, `walk rate ${rate} is inside the clamp`);
  assert.equal(rate * WALK_CLIP_SPEED, WALK_SPEED, "stride speed equals body speed");
  const run = clipRates(RUN_SPEED).run;
  assert.ok(run < MAX_PLAYBACK_RATE && Math.abs(run * RUN_CLIP_SPEED - RUN_SPEED) < 1e-9, "run is unclamped at run speed too");
});

test("gaitCycleRate: walk and run share one phase, weighted by their blend", () => {
  const durations = { walk: 1.0, run: 0.6 };
  const walkOnly = gaitCycleRate(clipWeights(WALK_SPEED), clipRates(WALK_SPEED), durations);
  assert.ok(Math.abs(walkOnly - clipRates(WALK_SPEED).walk / durations.walk) < 1e-9);
  const runOnly = gaitCycleRate(clipWeights(RUN_SPEED), clipRates(RUN_SPEED), durations);
  assert.ok(Math.abs(runOnly - clipRates(RUN_SPEED).run / durations.run) < 1e-9);
  const mid = (WALK_SPEED + RUN_SPEED) / 2;
  const blended = gaitCycleRate(clipWeights(mid), clipRates(mid), durations);
  const w = clipWeights(mid);
  const r = clipRates(mid);
  const expected = (w.walk * (r.walk / durations.walk) + w.run * (r.run / durations.run)) / (w.walk + w.run);
  assert.ok(Math.abs(blended - expected) < 1e-9);
  // Slow walk (mostly idle) still advances the gait at the walk clip's own rate.
  const slow = gaitCycleRate(clipWeights(1), clipRates(1), durations);
  assert.ok(Math.abs(slow - clipRates(1).walk / durations.walk) < 1e-9);
  assert.equal(gaitCycleRate(clipWeights(0), clipRates(0), durations) > 0, true);
  assert.equal(gaitCycleRate(clipWeights(WALK_SPEED), clipRates(WALK_SPEED), { walk: 0, run: 0 }), 0);
});

test("advanceGaitPhase wraps into [0, 1) and ignores invalid steps", () => {
  assert.ok(Math.abs(advanceGaitPhase(0.25, 0.5, 1) - 0.75) < 1e-9);
  assert.ok(Math.abs(advanceGaitPhase(0.75, 0.5, 1) - 0.25) < 1e-9);
  assert.ok(Math.abs(advanceGaitPhase(0.5, 2.25, 1) - 0.75) < 1e-9);
  assert.equal(advanceGaitPhase(0.4, Number.NaN, 1), 0.4);
  assert.equal(advanceGaitPhase(0.4, -1, 1), 0.4);
  assert.equal(advanceGaitPhase(0.4, 0.1, Number.POSITIVE_INFINITY), 0.4);
});
