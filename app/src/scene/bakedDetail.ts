/**
 * Surface detail on Cycles-baked (lightmapped, drawn unlit) arrival materials.
 *
 * A lightmapped non-metal is drawn as albedo x lightmap (bakedLighting.ts). The 2048 atlas spans
 * the whole square, so on its own it reads as a flat decal: the exported normal maps (sandstone
 * grain, cobble setts, roof tiles, banner weave) were dropped with the lit material, every wall
 * repeats the same tile, and the clay pots are matte (fidelity r2 Materials 38, Paving 60). The
 * detail shader (bakedDetailShader.ts) puts three cheap terms back on top of the bake, without
 * re-lighting it:
 * - relief: the normal map tilts the sun term where the bake is sunlit, and darkens grooves
 *   (grout, chips, tile joints) everywhere;
 * - macro: a low-frequency world-space albedo variation that breaks up the tiling;
 * - glaze: a sun highlight and a sky fresnel rim on glazed ceramics.
 *
 * No runtime imports: unit-tested with Node type stripping. Keep reliefFactor/sunlitWeight in sync
 * with the GLSL in bakedDetailShader.ts.
 */

export interface SurfaceDetail {
  /** Gain on the normal-mapped sun term (0 = off). */
  relief: number;
  /** Darkening where the mapped normal leaves the surface normal (grooves, joints). */
  cavity: number;
  /** Peak albedo variation of the world-space macro noise (0.1 = +-10%). */
  macro: number;
  /** Glazed-ceramic highlight and fresnel rim (0 = matte). */
  glaze: number;
}

const MASONRY: SurfaceDetail = Object.freeze({ relief: 0.8, cavity: 0.35, macro: 0.1, glaze: 0 });
const PAVING: SurfaceDetail = Object.freeze({ relief: 1, cavity: 0.5, macro: 0.12, glaze: 0 });
const ROOF: SurfaceDetail = Object.freeze({ relief: 0.9, cavity: 0.45, macro: 0.14, glaze: 0 });
const CLOTH: SurfaceDetail = Object.freeze({ relief: 0.6, cavity: 0.25, macro: 0.04, glaze: 0 });
const PLASTER: SurfaceDetail = Object.freeze({ relief: 0.5, cavity: 0.2, macro: 0.08, glaze: 0 });
const POT: SurfaceDetail = Object.freeze({ relief: 0, cavity: 0, macro: 0.05, glaze: 0.7 });
const TERRACOTTA: SurfaceDetail = Object.freeze({ relief: 0, cavity: 0, macro: 0.08, glaze: 0.25 });

/** Keyed by Blender material name without the exporter's `_lm` suffix. */
export const SURFACE_DETAIL: Readonly<Record<string, SurfaceDetail>> = Object.freeze({
  ar_ashlar: MASONRY,
  ar_limestone: MASONRY,
  ar_limestone_pale: MASONRY,
  ar_fountain_stone: MASONRY,
  ar_terrace_wall: MASONRY,
  ar_plaster_warm: PLASTER,
  ar_plaster_rose: PLASTER,
  ar_cobble: PAVING,
  ar_pale_band: PAVING,
  ar_plum_band: PAVING,
  ar_roof_tiles: ROOF,
  ar_banner_cloth: CLOTH,
  ar_drape_plum: CLOTH,
  ar_clay_pot: POT,
  ar_terracotta: TERRACOTTA,
});

/** The detail for a material, or null when it has none. Accepts the baked (`_lm`, `#baked`) names. */
export function surfaceDetail(materialName: string | undefined): SurfaceDetail | null {
  if (!materialName) return null;
  const base = materialName.replace(/#.*$/, "").replace(/_lm$/i, "");
  return SURFACE_DETAIL[base] ?? null;
}

/**
 * Bake levels (lightmap luma x scale: the multiplier on albedo) between which a texel counts as
 * shaded (0) or fully sunlit (1). Cycles' shaded walls sit near 0.5, sunlit stone near 1.3-1.8.
 */
export const SUNLIT_LOW = 0.6;
export const SUNLIT_HIGH = 1.3;
/** Relief never takes a texel below or above these multiples of its baked colour. */
export const RELIEF_MIN = 0.45;
export const RELIEF_MAX = 1.6;

export function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** How sunlit a baked texel is, from its level (see SUNLIT_LOW/HIGH). */
export function sunlitWeight(level: number): number {
  return smoothstep(SUNLIT_LOW, SUNLIT_HIGH, level);
}

export interface ReliefInput {
  /** max(dot(surface normal, sun), 0). */
  base: number;
  /** max(dot(mapped normal, sun), 0). */
  bent: number;
  /** dot(mapped normal, surface normal): 1 on flat texels, lower in grooves. */
  facing: number;
  /** sunlitWeight of the texel. */
  sunlit: number;
}

/** Multiplier on the baked colour: 1 on a flat texel, brighter on sun-facing bumps, darker in grooves. */
export function reliefFactor(p: ReliefInput, d: Pick<SurfaceDetail, "relief" | "cavity">): number {
  const sun = d.relief * p.sunlit * (p.bent - p.base);
  const groove = d.cavity * (1 - Math.min(1, Math.max(0, p.facing)));
  return Math.min(RELIEF_MAX, Math.max(RELIEF_MIN, 1 + sun - groove));
}

/** World-space periods (metres) of the two macro-variation octaves: never a multiple of a tile. */
export const MACRO_PERIODS = Object.freeze([6.3, 19.7] as const);

/** Glaze highlight exponent and gain (Blinn-Phong on the mapped normal) and fresnel rim gain. */
export const GLAZE = Object.freeze({ shininess: 90, highlight: 2.2, rim: 0.45 });
