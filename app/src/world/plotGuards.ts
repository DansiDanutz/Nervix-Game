/**
 * Scene-wave guards for runtime K2 houses (and their NPCs) on manifest plots.
 * Pure and frozen; type-only shapes, so Node tests it.
 *
 * - builtPlotIds: plots that Blender already built (a door of the exported
 *   scene stands on the plot threshold, or the plot id is an existing door
 *   id), so <MerchantHouses> never draws a second building there.
 * - clearOfSightline: the arrival frame stays as judged, so no runtime house or
 *   NPC may stand in the corridor from the street spawn to the fountain.
 */

interface Point {
  readonly x: number;
  readonly z: number;
}

interface PlotLike {
  readonly id: string;
  readonly door: Point;
}

/** A Blender door this close to a plot threshold (m) means that plot is already built. */
export const BUILT_DOOR_REACH = 1.5;
/** Half width (m) of the spawn-to-fountain corridor that runtime houses keep clear of. */
export const SIGHTLINE_HALF_WIDTH = 4;

export function builtPlotIds(
  plots: readonly PlotLike[],
  builtDoors: readonly Point[],
  existingDoorIds: readonly string[] = [],
  reach = BUILT_DOOR_REACH,
): ReadonlySet<string> {
  const ids = new Set(existingDoorIds);
  const built = plots.filter((p) => ids.has(p.id) || builtDoors.some((d) => Math.hypot(d.x - p.door.x, d.z - p.door.z) <= reach));
  return new Set(built.map((p) => p.id));
}

/** Distance from `p` to the segment a-b (a point when a equals b). */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

export function clearOfSightline<P extends PlotLike>(
  plots: readonly P[],
  spawn: Point,
  fountain: Point,
  halfWidth = SIGHTLINE_HALF_WIDTH,
): readonly P[] {
  return Object.freeze(plots.filter((p) => segmentDistance(p.door, spawn, fountain) > halfWidth));
}
