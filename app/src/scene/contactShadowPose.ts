/**
 * Ground shadows for dynamic figures (avatar, pedestrians) on the Cycles-baked square.
 *
 * Baked surfaces are drawn unlit (bakedLighting.ts) and never receive runtime shadow maps, so a
 * walker on the paving had no shadow at all and floated. Each figure gets a soft lavender decal
 * cast away from the sun: its length follows the sun elevation like a real cast shadow (long at
 * golden hour), clamped so a low sun never paints a stripe across the square.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

export interface ContactShadowPose {
  /** Decal length along the shadow direction and width across it (metres). */
  length: number;
  width: number;
  /** Centre offset from the figure's feet in world x/z (half the cast length away from the sun). */
  offsetX: number;
  offsetZ: number;
  /** rotation.y that turns the decal's local +z (its length axis) along the shadow. */
  yaw: number;
}

/** Shadow colour and peak opacity: Blender's shaded paving reads lavender-plum, not grey. */
export const CONTACT_SHADOW = Object.freeze({ color: "#4b3a63", opacity: 0.5, width: 0.75, minLength: 0.9, maxLength: 4.5, footPad: 0.35 });

/** Lowest elevation the length formula trusts (radians); below it the clamp holds. */
const MIN_ELEVATION = 0.05;

/** Pose of the decal for a figure `height` metres tall under a sun in direction `toSun` (need not be unit). */
export function contactShadowPose(toSun: readonly [number, number, number], height: number): ContactShadowPose {
  const [sx, sy, sz] = toSun;
  const flat = Math.hypot(sx, sz);
  const { width, minLength, maxLength, footPad } = CONTACT_SHADOW;
  if (!(flat > 1e-6) || !(sy > 0)) return { length: minLength, width, offsetX: 0, offsetZ: 0, yaw: 0 };
  const elevation = Math.max(MIN_ELEVATION, Math.atan2(sy, flat));
  const cast = Math.max(0, height) / Math.tan(elevation);
  const length = Math.min(maxLength, Math.max(minLength, cast + footPad));
  const dx = -sx / flat;
  const dz = -sz / flat;
  const along = length / 2 - footPad / 2;
  return { length: +length.toFixed(4), width, offsetX: +(dx * along).toFixed(4), offsetZ: +(dz * along).toFixed(4), yaw: Math.atan2(dx, dz) };
}
