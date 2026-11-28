/**
 * Per-material colour correction for the Blender exports, applied to cloned materials at load.
 *
 * Through three.js AgX the gold trims/planters and the plum door paint measured S ~0.33-0.35 on
 * the GPU spawn frame against ~0.48 in Cycles, and the foreground paving read lighter and pinker
 * than Blender. Saturation is raised in linear light around Rec. 709 luminance.
 *
 * Round 4 (re-measured on the GPU spawn frame against blender-arrival-street.png): the amber key
 * light and peach hemisphere pushed the paving to hue ~21 / S ~0.33 (Cycles ~10 / ~0.21) and the plum
 * domes and bands to crimson (hue ~0-4 vs ~353). Paving now gets a red trim and blue lift (hue back
 * toward rose) at ~-12% albedo; plum, plum bands and the landmark rose get a blue lift instead of a
 * plain saturation boost, which in linear light pushed them further toward red.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

export type LinearRgb = readonly [number, number, number];

export interface ColorGrade {
  /** Linear-light saturation gain around luminance (1 = unchanged). */
  saturation: number;
  /** Albedo gain (1 = unchanged). */
  value: number;
  /** Optional per-channel multiplier applied after saturation and value. */
  tint?: LinearRgb;
}

const GOLD: ColorGrade = Object.freeze({ saturation: 1.35, value: 1 });
const BRASS: ColorGrade = Object.freeze({ saturation: 1.25, value: 1 });
const PLUM: ColorGrade = Object.freeze({ saturation: 1.15, value: 1.05, tint: Object.freeze([1, 1, 1.45] as const) });
const PAVING: ColorGrade = Object.freeze({ saturation: 1, value: 0.88, tint: Object.freeze([0.93, 1, 1.15] as const) });
/** Rose/plum paints that the amber key light pushes toward crimson: a blue lift restores Blender's hue. */
const ROSE: ColorGrade = Object.freeze({ saturation: 1, value: 1, tint: Object.freeze([0.95, 1, 1.3] as const) });
/**
 * The plum bands are textured over a white factor, so a tint above 1 would clamp: the blue lift is
 * expressed as a red/green trim instead (factor ~(0.74, 0.8, 1)) to move the band from crimson to plum.
 */
const PLUM_BAND: ColorGrade = Object.freeze({ saturation: 1, value: 0.8, tint: Object.freeze([0.92, 1, 1.25] as const) });

/** Keyed by Blender material name: arrival square (ar_*) and the OpenPoker facade (oc_*). */
export const ARRIVAL_MATERIAL_GRADE: Readonly<Record<string, ColorGrade>> = Object.freeze({
  ar_gold: GOLD,
  ar_brass: BRASS,
  ar_plum: PLUM,
  ar_plum_deep: PLUM,
  ar_dome_rose: ROSE,
  ar_plum_band: PLUM_BAND,
  ar_cobble: PAVING,
  ar_pale_band: PAVING,
  oc_gold: GOLD,
  oc_brass: BRASS,
  oc_plum_velvet: PLUM,
});

const LUMA: LinearRgb = [0.2126, 0.7152, 0.0722];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A graded copy of a linear-light colour; the input is never modified. */
export function gradeLinear(rgb: LinearRgb, grade: ColorGrade): [number, number, number] {
  const lum = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
  const tint = grade.tint ?? [1, 1, 1];
  return rgb.map((c, i) => clamp01((lum + (c - lum) * grade.saturation) * grade.value * tint[i])) as [number, number, number];
}
