/**
 * Shared touch input (CT4). The on-screen pad writes immutable `TouchPad`
 * snapshots into a tiny store; the player controller reads `touch` (live
 * getters over the store) through `driveFrom`, and `withTouch` adds the run
 * toggle and the turn buttons. Holds are tracked per pointer id, so a second
 * finger, pointerup, pointercancel and lost capture each release exactly the
 * pointer that ended. Pure functions are tested in input.test.ts.
 */
import type { Drive, TouchState } from "../input/movement";

export type TouchButton = "forward" | "back" | "left" | "right" | "turnLeft" | "turnRight";

export const TOUCH_BUTTONS: readonly TouchButton[] = Object.freeze(["forward", "back", "left", "right", "turnLeft", "turnRight"]);

export interface TouchPad {
  /** Pointer id (as a string key) to the button that pointer holds. */
  readonly held: Readonly<Record<string, TouchButton>>;
  /** The run toggle: a mode, not a hold. */
  readonly run: boolean;
}

const freezePad = (held: Record<string, TouchButton>, run: boolean): TouchPad => Object.freeze({ held: Object.freeze(held), run });

export const EMPTY_PAD: TouchPad = freezePad({}, false);

const isButton = (b: unknown): b is TouchButton => typeof b === "string" && (TOUCH_BUTTONS as readonly string[]).includes(b);

export function pressPad(pad: TouchPad, pointerId: number, button: TouchButton): TouchPad {
  if (!Number.isFinite(pointerId) || !isButton(button)) return pad;
  const key = String(pointerId);
  if (pad.held[key] === button) return pad;
  return freezePad({ ...pad.held, [key]: button }, pad.run);
}

export function releasePad(pad: TouchPad, pointerId: number): TouchPad {
  const key = String(pointerId);
  if (!(key in pad.held)) return pad;
  const rest = Object.fromEntries(Object.entries(pad.held).filter(([k]) => k !== key));
  return freezePad(rest, pad.run);
}

export function releaseAllPad(pad: TouchPad): TouchPad {
  return Object.keys(pad.held).length === 0 ? pad : freezePad({}, pad.run);
}

export function toggleRun(pad: TouchPad): TouchPad {
  return freezePad({ ...pad.held }, !pad.run);
}

export function isHeld(pad: TouchPad, button: TouchButton): boolean {
  return Object.values(pad.held).includes(button);
}

const axis = (plus: boolean, minus: boolean) => (plus ? 1 : 0) - (minus ? 1 : 0);

/**
 * Adds the pad's run toggle and turn buttons to a keyboard drive (movement is
 * already merged by `driveFrom` through `touch`). A key always wins: Q/R keep
 * their turn and Shift keeps running whatever the pad shows.
 */
export function withTouch(drive: Drive, pad: TouchPad): Drive {
  const padTurn = axis(isHeld(pad, "turnLeft"), isHeld(pad, "turnRight"));
  return Object.freeze({ ...drive, run: drive.run || pad.run, turn: drive.turn !== 0 ? drive.turn : padTurn });
}

// --- The store the pad writes and the controller reads ---------------------

let current: TouchPad = EMPTY_PAD;
const listeners = new Set<() => void>();

function commit(next: TouchPad) {
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export const touchPad = Object.freeze({
  get: (): TouchPad => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
});

export const pressTouch = (pointerId: number, button: TouchButton) => commit(pressPad(current, pointerId, button));
export const releaseTouch = (pointerId: number) => commit(releasePad(current, pointerId));
/** Blur or a hidden tab: let go of every held button, keep the run mode. */
export const releaseAllTouch = () => commit(releaseAllPad(current));
export const toggleTouchRun = () => commit(toggleRun(current));
/** Leaving the world: no holds and walking speed. */
export const resetTouch = () => commit(EMPTY_PAD);

/** Live, read-only view of the pad's movement holds, merged by `driveFrom`. */
export const touch: TouchState = Object.freeze({
  get forward() {
    return isHeld(current, "forward");
  },
  get back() {
    return isHeld(current, "back");
  },
  get left() {
    return isHeld(current, "left");
  },
  get right() {
    return isHeld(current, "right");
  },
});
