/**
 * Keyboard and touch locomotion tuning, as named constants and pure functions
 * the player controller runs every frame (tested in movement.test.ts).
 */
import type { HeldKeys } from "./keys";

/** Walking speed, metres per second. */
export const WALK_SPEED = 4.2;
/** Shift multiplies the walking speed (run / walk distance ratio). */
export const RUN_MULTIPLIER = 1.7;
/** Q turns left and R turns right at this rate, radians per second. */
export const KEY_TURN_RATE = 1.8;
/** Longest frame step simulated, seconds: a stall never teleports the player. */
export const MAX_FRAME_DELTA = 0.05;

export interface TouchState {
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface Drive {
  /** +1 forward, -1 back, 0 none. */
  readonly forward: number;
  /** +1 screen-right, -1 screen-left, 0 none. */
  readonly strafe: number;
  readonly run: boolean;
  /** +1 turning left (yaw increases), -1 turning right. */
  readonly turn: number;
}

const axis = (plus: boolean, minus: boolean) => (plus ? 1 : 0) - (minus ? 1 : 0);

export function driveFrom(held: HeldKeys, touch: TouchState): Drive {
  return Object.freeze({
    forward: axis(held.has("w") || held.has("arrowup") || touch.forward, held.has("s") || held.has("arrowdown") || touch.back),
    strafe: axis(held.has("d") || held.has("arrowright") || touch.right, held.has("a") || held.has("arrowleft") || touch.left),
    run: held.has("shift"),
    turn: axis(held.has("q"), held.has("r")),
  });
}

export function groundSpeed(run: boolean): number {
  return WALK_SPEED * (run ? RUN_MULTIPLIER : 1);
}

export function turnYaw(yaw: number, turn: number, delta: number): number {
  return turn === 0 ? yaw : yaw + turn * KEY_TURN_RATE * delta;
}

export function frameDelta(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, MAX_FRAME_DELTA);
}
