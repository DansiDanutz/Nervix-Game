/**
 * Which fountain meshes get the animated water shaders, and the colours they use.
 *
 * - "pool": `fountain_water*` (material ar_water): transparent teal with fresnel sky reflection,
 *   scrolling wave normals and a sun glint.
 * - "stream": `fountain_falls*` / `fountain_jet*` (ar_water_fall): arcing jet ribbons with streaks
 *   running down them.
 * - "foam": `fountain_splash*` (ar_water_foam): white splash with fast flicker.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

export type WaterKind = "pool" | "stream" | "foam";

const BY_NODE: ReadonlyArray<[RegExp, WaterKind]> = [
  [/^fountain_water/i, "pool"],
  [/^fountain_(falls|jet)/i, "stream"],
  [/^fountain_splash/i, "foam"],
];
const BY_MATERIAL: Readonly<Record<string, WaterKind>> = Object.freeze({ ar_water: "pool", ar_water_fall: "stream", ar_water_foam: "foam" });

/**
 * Classify a mesh from its own and its ancestors' names (nearest first) and its material name.
 * Node names win; the material name is the fallback for multi-primitive meshes.
 */
export function waterKind(nodeNames: readonly string[], materialName: string | undefined): WaterKind | null {
  for (const name of nodeNames) for (const [re, kind] of BY_NODE) if (re.test(name)) return kind;
  return (materialName && BY_MATERIAL[materialName]) || null;
}

/** sRGB #rrggbb to linear-light [r, g, b] (the space shader uniforms work in). */
export function srgbToLinear(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`water: bad colour ${hex}`);
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

/** A01 water: clear turquoise over the pale basin, deepening toward the centre. */
export const WATER_LOOK = Object.freeze({
  shallow: "#5fc7c0",
  deep: "#1d6f78",
  foam: "#f4fbf8",
  /** Opacity looking straight down and at grazing angles (fresnel). */
  alphaNear: 0.55,
  alphaGrazing: 0.93,
  /** Wave normal strength and scroll speed (m/s). */
  waveStrength: 0.22,
  waveSpeed: 0.35,
  /** Jet streak density (per metre) and fall speed (m/s). */
  streakDensity: 3.2,
  fallSpeed: 1.6,
});

/** Unit vector toward the sun from a light position (the light targets the origin). */
export function sunDirection(position: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(position[0], position[1], position[2]);
  if (!(len > 0)) return [0, 1, 0];
  return [position[0] / len, position[1] / len, position[2] / len];
}
