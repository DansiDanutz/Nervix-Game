/** Layout and action rules for the on-screen touch pad (TouchControls.tsx), pure and tested. */
import type { TouchButton } from "../net/input";

export interface PadButtonSpec {
  readonly id: TouchButton;
  readonly label: string;
  readonly glyph: string;
}

const spec = (id: TouchButton, label: string, glyph: string): PadButtonSpec => Object.freeze({ id, label, glyph });

/** The D-pad rows: forward on top, then left, back, right. */
export const MOVE_ROWS: readonly (readonly PadButtonSpec[])[] = Object.freeze([
  Object.freeze([spec("forward", "Forward", "▲")]),
  Object.freeze([spec("left", "Left", "◀"), spec("back", "Back", "▼"), spec("right", "Right", "▶")]),
]);

export const TURN_BUTTONS: readonly PadButtonSpec[] = Object.freeze([spec("turnLeft", "Turn left", "⟲"), spec("turnRight", "Turn right", "⟳")]);

export type TouchAction = "enter" | "exit" | null;

/** Exit inside a place, Enter with a door in reach, otherwise no action button. */
export function touchAction(interior: boolean, canEnter: boolean): TouchAction {
  if (interior) return "exit";
  return canEnter ? "enter" : null;
}

/** `touchpad--door` lets desktop (fine pointer) show the pad only while a door is in reach. */
export function padClassName(action: TouchAction): string {
  return action ? "touchpad touchpad--door" : "touchpad";
}
