/** What the player can interact with from where they stand, and the place hint text. */
import type { HouseDoor } from "../scene/HouseDoors";
import { near, type Anchor, type Place, type SliceLayout } from "../scene/slice";

export type Target =
  | { kind: "venue"; label: string }
  | { kind: "house"; door: HouseDoor; label: string }
  | { kind: "exit"; label: string };

/** The open merchant doors per place, labelled from the world directory (useWorldDirectory). */
export interface OpenDoors {
  readonly plazaDoors: readonly HouseDoor[];
  readonly salonDoors: readonly HouseDoor[];
}

const ROOM_EXIT: Anchor = Object.freeze({ x: 0, z: 4.3 });
const ROOM_BACK_EXIT: Anchor = Object.freeze({ x: 0, z: -4.0 });
const SALON_DOOR_REACH = 2.4;
const PLAZA_DOOR_REACH = 2.8;

const doorAnchor = (d: HouseDoor): Anchor => ({ x: d.position[0], z: d.position[2] });

function houseTargetNear(doors: readonly HouseDoor[], x: number, z: number, reach: number): Target | null {
  const door = doors.find((d) => near(doorAnchor(d), x, z, reach));
  return door ? { kind: "house", door, label: door.label } : null;
}

export function targetAt(place: Place, layout: SliceLayout | null, x: number, z: number, doors: OpenDoors): Target | null {
  if (place.kind === "house") {
    return near(ROOM_EXIT, x, z, 2.2) || near(ROOM_BACK_EXIT, x, z, 2.2) ? { kind: "exit", label: "Plaza" } : null;
  }
  if (!layout) return null;
  if (place.kind === "venue") {
    const house = houseTargetNear(doors.salonDoors, x, z, SALON_DOOR_REACH);
    if (house) return house;
    if (near(layout.salon.exit, x, z)) return { kind: "exit", label: "Plaza" };
    return null;
  }
  if (near(layout.facadeDoor, x, z, 3.0)) return { kind: "venue", label: "OpenPoker" };
  return houseTargetNear(doors.plazaDoors, x, z, PLAZA_DOOR_REACH);
}

export function placeLabel(place: Place): string {
  if (place.kind === "plaza") return "Plaza · WASD to walk · Shift to run · drag to look · Q/R turn";
  if (place.kind === "venue") return "OpenPoker salon · a merchant house is in the right alcove · Esc returns to the plaza";
  return `${place.door.label} · Esc returns to the plaza`;
}

/** The place a target leads to, given where the player is now. */
export function destinationOf(t: Target, current: Place): Place {
  if (t.kind === "venue") return { kind: "venue", id: "openpoker" };
  if (t.kind === "house") return { kind: "house", door: t.door, from: current.kind === "venue" ? "openpoker" : "plaza" };
  return { kind: "plaza" };
}
