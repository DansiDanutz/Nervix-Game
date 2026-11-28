/** What the player can interact with from where they stand, and the place hint text. */
import type { HouseDoor } from "../scene/HouseDoors";
import { danggDoor, near, testBuilderDoor, type Anchor, type Place, type SliceLayout } from "../scene/slice";

export type Target =
  | { kind: "venue"; label: string }
  | { kind: "house"; door: HouseDoor; label: string }
  | { kind: "exit"; label: string };

const ROOM_EXIT: Anchor = Object.freeze({ x: 0, z: 4.3 });
const ROOM_BACK_EXIT: Anchor = Object.freeze({ x: 0, z: -4.0 });

export function targetAt(place: Place, layout: SliceLayout | null, x: number, z: number): Target | null {
  if (place.kind === "house") {
    return near(ROOM_EXIT, x, z, 2.2) || near(ROOM_BACK_EXIT, x, z, 2.2) ? { kind: "exit", label: "Plaza" } : null;
  }
  if (!layout) return null;
  if (place.kind === "venue") {
    const dangg = danggDoor(layout);
    if (near(layout.salon.danggDoor, x, z)) return { kind: "house", door: dangg, label: "DanGG" };
    if (near(layout.salon.exit, x, z)) return { kind: "exit", label: "Plaza" };
    return null;
  }
  if (near(layout.facadeDoor, x, z, 3.0)) return { kind: "venue", label: "OpenPoker" };
  const builder = testBuilderDoor(layout);
  const t = builder.position;
  if (near({ x: t[0], z: t[2] }, x, z, 2.8)) return { kind: "house", door: builder, label: builder.label };
  return null;
}

export function placeLabel(place: Place): string {
  if (place.kind === "plaza") return "Plaza · WASD to walk · Shift to run · drag to look · Q/R turn";
  if (place.kind === "venue") return "OpenPoker salon · DanGG's house is in the right alcove · Esc returns to the plaza";
  return `${place.door.label} · Esc returns to the plaza`;
}

/** The place a target leads to, given where the player is now. */
export function destinationOf(t: Target, current: Place): Place {
  if (t.kind === "venue") return { kind: "venue", id: "openpoker" };
  if (t.kind === "house") return { kind: "house", door: t.door, from: current.kind === "venue" ? "openpoker" : "plaza" };
  return { kind: "plaza" };
}
