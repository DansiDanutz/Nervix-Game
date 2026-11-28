/**
 * Blender's ArrivalWorld sky (blender/scripts/arrival_skyline.py build_world), as data the client
 * sky dome reproduces: a colour ramp over the view direction's height, a Perlin-noise cloud mask
 * (scale 3, ramp 0.55 -> 0.75) mixing in warm cream, and the camera-ray strength.
 *
 * The manifest only carries three of the six stops (lighting.sky_gradient), and the round-1 dome
 * graded them toward beige, so the game sky read washed grey-beige against Blender's blue with
 * cream/pink banks. Keep these in sync with build_world.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

export interface RampStop {
  position: number;
  color: string;
}

export const BLENDER_WORLD = Object.freeze({
  stops: Object.freeze([
    { position: 0.0, color: "#ffd9a0" },
    { position: 0.08, color: "#ffcda0" },
    { position: 0.18, color: "#f9c2aa" },
    { position: 0.3, color: "#ddc8d8" },
    { position: 0.45, color: "#afcbeb" },
    { position: 0.8, color: "#8db7e8" },
  ] as const satisfies readonly RampStop[]),
  /** SKY_CAMERA_STRENGTH: what the camera sees. */
  strength: 1.1,
  cloudColor: "#ffe1c6",
  cloudScale: 3,
  cloudLow: 0.55,
  cloudHigh: 0.75,
});

/** Number of ramp stops the sky shader is compiled for. */
export const SKY_STOP_COUNT = BLENDER_WORLD.stops.length;

/** Blender ColorRamp (linear interpolation): the segment and blend factor for `fac`. */
export function rampSegment(positions: readonly number[], fac: number): { index: number; t: number } {
  if (positions.length === 0) throw new Error("sky ramp: no stops");
  if (fac <= positions[0]) return { index: 0, t: 0 };
  for (let i = 0; i < positions.length - 1; i++) {
    if (fac <= positions[i + 1]) {
      const span = positions[i + 1] - positions[i];
      return { index: i, t: span > 0 ? (fac - positions[i]) / span : 1 };
    }
  }
  return { index: positions.length - 1, t: 0 };
}

/** Linear cloud ramp: 0 below `low`, 1 above `high`. */
export function cloudMask(noise: number, low = BLENDER_WORLD.cloudLow, high = BLENDER_WORLD.cloudHigh): number {
  return Math.min(1, Math.max(0, (noise - low) / (high - low)));
}
