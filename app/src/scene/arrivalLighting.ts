/**
 * Runtime light rig for the Blender arrival square, derived from the manifest lighting.
 *
 * Blender lights the square with a peach-to-lavender sky gradient. A hemisphere light
 * coloured like the warm horizon turns plum paving crimson, while one coloured like the
 * blue zenith greys it out; the exporter's lavender hemisphere sky sits between the two
 * and matches Blender's rose paving. This module also resolves the sky dome stops and a
 * low bounce light opposite the sun.
 *
 * On top of the exported values the client applies a golden-hour grade, tuned against
 * the Blender render and A01: three.js lights shaded walls flatter and greyer than Cycles bounce
 * light, and the round-2 frame read as overcast dusk-lilac. So the sun is raised ~20% and pulled
 * toward ~3100 K amber, the hemisphere sky moves part-way from lavender toward peach over a
 * terracotta ground, the bounce fill is tinted toward a golden paving bounce instead of blue-grey,
 * the mid sky stop is a darkened muted peach-gold (not mauve), the zenith is desaturated to a warm
 * pale blue, and the fog is warmed toward peach. The sun direction stays Blender's (shadows match). Measured on the GPU spawn frame against blender-arrival-street.png:
 * a plum-rose fill pushed the shaded walls to hue ~22 / saturation ~0.24 (Blender: ~31 / ~0.35);
 * the amber bounce gives ~28 / ~0.30 without turning the plum paving orange.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */
import type { PlazaLighting } from "./slice";

/** Lavender zenith of Blender's world gradient, used until the manifest exports sky_gradient. */
export const DEFAULT_SKY_ZENITH = "#cfc4d8";
/** Low warm bounce opposite the sun: lifts shaded facades toward Blender's lightness. */
export const FILL_INTENSITY = 0.2;
export const FILL_COLOR = "#ffe6d2";
/** The fill comes from lower than the sun, like light bounced off the paving. */
const FILL_HEIGHT_OF_SUN = 0.5;

/** Golden-hour grade over the exported lighting (see the module comment). */
export const GRADE = Object.freeze({
  /** Warm key light: +20% over the exported sun so sunlit walls read honey-gold (L >= 0.55), not beige. */
  sunGain: 1.2,
  /** Key light pulled toward ~3100 K amber. */
  sunTint: "#ffb060",
  sunMix: 0.4,
  /** Hemisphere sky moved from lavender part-way toward peach: warm, without turning plum paving crimson. */
  hemisphereSkyTint: "#f6c9a0",
  hemisphereSkyMix: 0.3,
  /** Hemisphere ground pulled toward warm terracotta: a warm bounce that saturates the shaded walls. */
  groundTint: "#c0703c",
  /** Round 4: 0.6 over-oranged the paving and shaded walls; 0.45 keeps the warm bounce. */
  groundMix: 0.45,
  /** Slight trim of the sky/ground fill so the shaded walls keep Blender's lightness. */
  hemisphereGain: 0.96,
  /** Bounce fill tinted toward a golden paving bounce rather than neutral blue-grey. */
  fillTint: "#f0a048",
  fillMix: 0.8,
  fillGain: 1.8,
  /** Mid sky stop pulled toward a muted peach-gold (not mauve), darkened to Blender's lightness. */
  skyMidTint: "#c0a488",
  skyMidMix: 0.75,
  /** Zenith desaturated toward a warm pale blue (Blender's sky top reads S <= 0.15). */
  skyZenithTint: "#d6c8bc",
  skyZenithMix: 0.65,
  /** Fog warmed slightly toward peach so the skyline sits in golden haze. */
  fogTint: "#f8c890",
  fogMix: 0.3,
  /**
   * Fidelity r2: Blender's world has no mist, and the exported 70-460 m linear fog veiled the hill,
   * aqueduct and temple (the "milky far field"). The fog now starts beyond the hill (~3x) and
   * thins out (~2.5x), leaving only a light aerial haze on the far mountains.
   */
  fogNearScale: 3,
  fogFarScale: 2.5,
});

const HEX = /^#[0-9a-f]{6}$/i;

function rgb(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`arrival lighting: bad colour ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** sRGB mix of two #rrggbb colours: t = 0 keeps `from`, t = 1 gives `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const a = rgb(from);
  const b = rgb(to);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Hue (degrees), saturation and lightness (0..1) of a #rrggbb colour. */
export function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface ArrivalRig {
  /** Dome stops; without `mid` the dome blends horizon straight to zenith. */
  sky: { horizon: string; mid: string | undefined; zenith: string };
  fog: { color: string; near: number; far: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  sun: { position: [number, number, number]; color: string; intensity: number };
  fill: { position: [number, number, number]; color: string; intensity: number };
}

export function arrivalRig(lighting: PlazaLighting): ArrivalRig {
  const horizon = lighting.skyGradient?.horizon ?? lighting.background;
  const exportedMid = lighting.skyGradient?.mid;
  const mid = exportedMid && mixHex(exportedMid, GRADE.skyMidTint, GRADE.skyMidMix);
  const zenith = mixHex(lighting.skyGradient?.zenith ?? DEFAULT_SKY_ZENITH, GRADE.skyZenithTint, GRADE.skyZenithMix);
  const [sx, sy, sz] = lighting.sun.position;
  const { fog } = lighting;
  return {
    sky: { horizon, mid, zenith },
    fog: { color: mixHex(fog.color, GRADE.fogTint, GRADE.fogMix), near: round3(fog.near * GRADE.fogNearScale), far: round3(fog.far * GRADE.fogFarScale) },
    hemisphere: {
      sky: mixHex(lighting.hemisphere.sky, GRADE.hemisphereSkyTint, GRADE.hemisphereSkyMix),
      ground: mixHex(lighting.hemisphere.ground, GRADE.groundTint, GRADE.groundMix),
      intensity: round3(lighting.hemisphere.intensity * GRADE.hemisphereGain),
    },
    sun: { position: [sx, sy, sz], color: mixHex(lighting.sun.color, GRADE.sunTint, GRADE.sunMix), intensity: round3(lighting.sun.intensity * GRADE.sunGain) },
    fill: {
      position: [-sx, sy * FILL_HEIGHT_OF_SUN, -sz],
      color: mixHex(lighting.fill?.color ?? FILL_COLOR, GRADE.fillTint, GRADE.fillMix),
      intensity: round3((lighting.fill?.intensity ?? FILL_INTENSITY) * GRADE.fillGain),
    },
  };
}
