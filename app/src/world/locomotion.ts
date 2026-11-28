/**
 * Locomotion (C7): the idle / walk / run state machine behind the skinned K1 avatar.
 * Pure and immutable; world3d/SkinnedAvatar.tsx drives a three.js AnimationMixer from it.
 *
 * Input is a position sample per frame ({x, z, tMs}: playerState.ref.current for the local
 * player, an interpolated pose for a remote one). Ground speed is derived from consecutive
 * samples and smoothed, so a single jittery frame never flips the clip. The discrete state has
 * hysteresis on both thresholds; the clip weights blend continuously by speed and always sum to 1.
 * The avatar turns toward the direction it moves along the shortest arc, with a rate cap.
 *
 * Reference speeds are the CT1 controller's (input/movement.ts): walk 4.2 m/s, Shift run x1.7.
 * They are repeated here because this module has no runtime imports (unit-tested with Node type
 * stripping); locomotion.test.ts asserts they stay equal to the controller's.
 */

export type LocomotionState = "idle" | "walk" | "run";

/** CT1 walking speed, m/s (input/movement.ts WALK_SPEED). */
export const WALK_SPEED = 4.2;
/** CT1 Shift multiplier (input/movement.ts RUN_MULTIPLIER). */
const RUN_MULTIPLIER = 1.7;
/** CT1 running speed, m/s (groundSpeed(true)). */
export const RUN_SPEED = WALK_SPEED * RUN_MULTIPLIER;
/** A step faster than this is a teleport or door transition (player/playerState.ts). */
export const MAX_GROUND_SPEED = 20;

/** Walk starts above this smoothed speed (m/s)... */
export const IDLE_EXIT_SPEED = 0.8;
/** ...and stops only below this one, so a slow drift never flickers between clips. */
export const IDLE_ENTER_SPEED = 0.4;
/** Half way between walk and run, with RUN_HYSTERESIS either side. */
const RUN_MIDPOINT = (WALK_SPEED + RUN_SPEED) / 2;
const RUN_HYSTERESIS = 0.25;
export const RUN_ENTER_SPEED = RUN_MIDPOINT + RUN_HYSTERESIS;
export const RUN_EXIT_SPEED = RUN_MIDPOINT - RUN_HYSTERESIS;

/** Exponential approach rate of the smoothed speed, per second (95% in about 0.37 s). */
export const SPEED_SMOOTHING_RATE = 8;
/** Exponential approach rate of the facing toward the travel direction, per second. */
export const TURN_SMOOTHING_RATE = 12;
/** Fastest turn the avatar shows, radians per second. */
export const TURN_MAX_RATE = 9;
/** Smallest step (m) that defines a travel direction; below it the heading holds. */
export const HEADING_MIN_STEP = 0.002;
/** Longest step (s) the smoothing integrates, so a stalled tab never overshoots. */
export const MAX_SMOOTH_STEP_S = 0.25;

/** Ground speed the K1 clips were authored at (kits/k1/manifest.json clips[].speed_mps). */
export const WALK_CLIP_SPEED = 1.4;
export const RUN_CLIP_SPEED = 3.6;
/** Playback clamp: limits foot slide without turning the stride into a blur. */
export const MIN_PLAYBACK_RATE = 0.5;
/** Run clamp (7.14 / 3.6 = 1.98 at RUN_SPEED, so run never clamps at its own speed). */
export const MAX_PLAYBACK_RATE = 2;
/**
 * Walk clamp. The K1 walk is authored at 1.4 m/s but CT1 walks at 4.2 m/s, so walk must play at 3x
 * for the stride to cover the ground; 3.2 leaves that unclamped (no foot slide) with a little margin.
 * Re-authoring the clip near 4.2 m/s (K1) would let this drop back toward 2.
 */
export const WALK_MAX_PLAYBACK_RATE = 3.2;

const MS_PER_S = 1000;

export interface LocomotionSample {
  readonly x: number;
  readonly z: number;
  readonly tMs: number;
}

export interface ClipWeights {
  readonly idle: number;
  readonly walk: number;
  readonly run: number;
}

export type ClipRates = ClipWeights;

export interface Locomotion {
  readonly state: LocomotionState;
  /** Smoothed ground speed, m/s. */
  readonly speed: number;
  /** Displayed rotation.y (0 faces +z, the K1 forward). */
  readonly heading: number;
  /** Direction of travel the heading turns toward. */
  readonly targetHeading: number;
  readonly last: LocomotionSample | null;
  readonly weights: ClipWeights;
  readonly rates: ClipRates;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteSpeed = (s: number) => (Number.isFinite(s) && s > 0 ? s : 0);

/** Wraps an angle into (-pi, pi]. */
function wrapAngle(a: number): number {
  const turn = Math.PI * 2;
  const wrapped = a - turn * Math.floor((a + Math.PI) / turn);
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

export function nextState(state: LocomotionState, speed: number): LocomotionState {
  const s = finiteSpeed(speed);
  if (state === "idle") return s > RUN_ENTER_SPEED ? "run" : s > IDLE_EXIT_SPEED ? "walk" : "idle";
  if (s < IDLE_ENTER_SPEED) return "idle";
  if (state === "walk") return s > RUN_ENTER_SPEED ? "run" : "walk";
  return s < RUN_EXIT_SPEED ? "walk" : "run";
}

/** idle -> walk over 0..WALK_SPEED, walk -> run over WALK_SPEED..RUN_SPEED. */
export function clipWeights(speed: number): ClipWeights {
  const s = finiteSpeed(speed);
  if (s < WALK_SPEED) {
    const t = s / WALK_SPEED;
    return Object.freeze({ idle: 1 - t, walk: t, run: 0 });
  }
  const t = clamp((s - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
  return Object.freeze({ idle: 0, walk: 1 - t, run: t });
}

/** Clip playback rates: walk and run follow ground speed inside the playback clamp. */
export function clipRates(speed: number): ClipRates {
  const s = finiteSpeed(speed);
  return Object.freeze({
    idle: 1,
    walk: clamp(s / WALK_CLIP_SPEED, MIN_PLAYBACK_RATE, WALK_MAX_PLAYBACK_RATE),
    run: clamp(s / RUN_CLIP_SPEED, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE),
  });
}

/** Clip lengths in seconds (AnimationClip.duration). */
export interface GaitDurations {
  readonly walk: number;
  readonly run: number;
}

const cyclesPerS = (rate: number, durationS: number) => (durationS > 0 && Number.isFinite(durationS) ? rate / durationS : 0);

/**
 * Gait cycles per second for the shared walk/run phase: each clip's cycle rate (playback rate over
 * clip length) weighted by its share of the walk + run blend. Driving both clips from one normalised
 * phase keeps the legs in step while walk and run are mixed (4.2..7.14 m/s).
 */
export function gaitCycleRate(weights: ClipWeights, rates: ClipRates, durations: GaitDurations): number {
  const walk = cyclesPerS(rates.walk, durations.walk);
  const run = cyclesPerS(rates.run, durations.run);
  const share = weights.walk + weights.run;
  if (share <= 0) return walk;
  return (weights.walk * walk + weights.run * run) / share;
}

/** Advances a normalised gait phase in [0, 1). Invalid or negative steps leave it unchanged. */
export function advanceGaitPhase(phase: number, dtS: number, cycleRate: number): number {
  const step = dtS * cycleRate;
  if (!Number.isFinite(step) || step < 0) return phase;
  const next = (phase + step) % 1;
  return next < 0 ? next + 1 : next;
}

/** One smoothing step from `current` toward `target` along the shortest arc, rate-capped. */
export function turnToward(current: number, target: number, dtS: number): number {
  const diff = wrapAngle(target - current);
  if (diff === 0) return current;
  const eased = diff * (1 - Math.exp(-TURN_SMOOTHING_RATE * dtS));
  const cap = TURN_MAX_RATE * dtS;
  return wrapAngle(current + clamp(eased, -cap, cap));
}

function build(state: LocomotionState, speed: number, heading: number, targetHeading: number, last: LocomotionSample | null): Locomotion {
  return Object.freeze({ state, speed, heading, targetHeading, last, weights: clipWeights(speed), rates: clipRates(speed) });
}

export function createLocomotion(heading = 0): Locomotion {
  return build("idle", 0, heading, heading, null);
}

const validSample = (s: LocomotionSample) => [s.x, s.z, s.tMs].every(Number.isFinite);

/** Advances the machine by one position sample. Stale or invalid samples return `prev` unchanged. */
export function stepLocomotion(prev: Locomotion, sample: LocomotionSample): Locomotion {
  if (!validSample(sample)) return prev;
  const last = prev.last;
  const frozen = Object.freeze({ x: sample.x, z: sample.z, tMs: sample.tMs });
  if (!last) return build(prev.state, prev.speed, prev.heading, prev.targetHeading, frozen);
  const dtS = (sample.tMs - last.tMs) / MS_PER_S;
  if (dtS <= 0) return prev;
  const dx = sample.x - last.x;
  const dz = sample.z - last.z;
  const moved = Math.hypot(dx, dz);
  const raw = moved / dtS;
  if (raw > MAX_GROUND_SPEED) return build("idle", 0, prev.heading, prev.heading, frozen);
  const step = Math.min(dtS, MAX_SMOOTH_STEP_S);
  const speed = prev.speed + (raw - prev.speed) * (1 - Math.exp(-SPEED_SMOOTHING_RATE * step));
  const targetHeading = moved > HEADING_MIN_STEP ? Math.atan2(dx, dz) : prev.targetHeading;
  const heading = turnToward(prev.heading, targetHeading, step);
  return build(nextState(prev.state, speed), speed, heading, targetHeading, frozen);
}
