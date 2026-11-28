/**
 * One shared placement transform per landmark.
 *
 * Blender (x, y, z) exports to three as (x, z, -y). The GLB's front faces point
 * toward +Z, so a landmark only needs an X offset to face the opening camera.
 * Meshes, interaction markers and dressing all read these offsets, so they can
 * never drift apart. Works for both the full-district GLB and the chunk set.
 */

export interface LandmarkPlacement {
  /** Blender-space name of the building object in the GLB. */
  object: string;
  /** Offset in three-space X (metres). */
  dx: number;
  /** Offset in three-space Z (metres). */
  dz: number;
}

export const LANDMARKS: LandmarkPlacement[] = [
  { object: "house", dx: 6.5, dz: 0 }, // merchant house: left of the fountain
  { object: "cafe", dx: -18.5, dz: 0 }, // café: far left, storefront to camera
  { object: "casino", dx: 9, dz: 0 }, // casino: right third, entrance to camera
];

const BY_OBJECT = new Map(LANDMARKS.map((l) => [l.object, l]));

export function placementFor(objectName: string) {
  return BY_OBJECT.get(objectName) ?? null;
}

/** Apply the shared offsets to every named building in a loaded scene. */
type Placeable = { name: string; position: { x: number; z: number }; userDataPlacementApplied?: boolean };

export function applyPlacement(root: { traverse: (fn: (o: Placeable) => void) => void }) {
  root.traverse((o) => {
    const p = placementFor(o.name);
    if (!p) return;
    if (o.userDataPlacementApplied) return;
    o.position.x += p.dx;
    o.position.z += p.dz;
    // mark so a re-run (HMR) never double-applies
    o.userDataPlacementApplied = true;
  });
}

/** Transform a Blender-space manifest position into placed three-space. */
export function placeMarker(position: [number, number, number], objectName: string): [number, number, number] {
  const p = placementFor(objectName);
  const three: [number, number, number] = [position[0], position[2], -position[1]];
  if (!p) return three;
  return [three[0] + p.dx, three[1], three[2] + p.dz];
}