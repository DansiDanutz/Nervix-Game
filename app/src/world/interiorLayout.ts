/**
 * B4 hookup glue: places a K2 interior template (interiorTemplate.ts) inside
 * the walk-in house room, whose frame, bounds, spawn and exits stay as they
 * were (SceneView ROOM_BOUNDS, targets.ts exits). The K2 facade (local +Z, door
 * at z 0) sits on the room's front wall, the side the player enters through,
 * so the K2 door is the room's front exit and the shelves, counter and NPC
 * station stand ahead of the player; the back exit stays clear.
 * Pure and frozen; type-only imports.
 */
import type { InteriorTemplate, Vec3 } from "./interiorTemplate";

/** The house room the player walks in (InteriorRoom): width along x, depth along z, height. */
export const ROOM_FRAME = Object.freeze({ width: 12, depth: 9, height: 4.2 });

export interface ShelfBoard {
  readonly id: string;
  /** Board centre in K2 template coordinates. */
  readonly position: Vec3;
  /** Width (x), thickness (y), depth (z) in metres. */
  readonly size: Vec3;
}

export interface InteriorRoomLayout {
  /** Where the K2 template origin sits in the room frame. */
  readonly origin: Vec3;
  readonly shelfBoards: readonly ShelfBoard[];
  /** Counter pose in template coordinates; yaw turns local +z toward the counter facing. */
  readonly counter: { readonly position: Vec3; readonly yaw: number };
}

const BOARD_THICKNESS = 0.04;
/** Extra board beyond the outermost slot extents (m). */
const BOARD_OVERHANG = 0.1;

type Frame = { readonly depth: number };

function shelfBoard(template: InteriorTemplate, shelf: InteriorTemplate["shelves"][number]): ShelfBoard {
  const slots = template.displaySlots.filter((s) => shelf.slots.includes(s.node));
  const left = Math.min(...slots.map((s) => s.position[0] - s.maxExtent[0] / 2));
  const right = Math.max(...slots.map((s) => s.position[0] + s.maxExtent[0] / 2));
  const depth = Math.max(...slots.map((s) => s.maxExtent[2])) + BOARD_OVERHANG;
  const position = Object.freeze([(left + right) / 2, shelf.y - BOARD_THICKNESS / 2, shelf.position[2]]) as Vec3;
  const size = Object.freeze([right - left + BOARD_OVERHANG, BOARD_THICKNESS, depth]) as Vec3;
  return Object.freeze({ id: shelf.id, position, size });
}

export function interiorRoomLayout(template: InteriorTemplate, room: Frame = ROOM_FRAME): InteriorRoomLayout {
  const [fx, , fz] = template.counter.facing;
  return Object.freeze({
    origin: Object.freeze([0, 0, room.depth / 2]) as Vec3,
    shelfBoards: Object.freeze(template.shelves.map((s) => shelfBoard(template, s))),
    counter: Object.freeze({ position: template.counter.position, yaw: Math.atan2(fx, fz) }),
  });
}
