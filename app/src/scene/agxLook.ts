/**
 * Blender's "AgX - Punchy" look for three.js.
 *
 * build_arrival_slice.py renders the arrival with view transform AgX and look "AgX - Punchy". three's
 * AgXToneMapping matches Blender's base AgX closely (RMS 7.7/255 over grey and colour ramps from
 * -4 to +6 EV) but has no looks, and Punchy darkens mid-grey from 118 to 88 (sRGB 8-bit), which is
 * the "milky, lifted" gap the judges measured between the game and the Cycles frames.
 *
 * Blender 5.3's config.ocio defines Punchy in its 25-stop "AgX Log" space as a GradingToneTransform
 * (shadows) followed by a CDL power. We model it as a power on that log value plus a shadow dip
 * between PIVOT and START, fitted to Blender's own output: a ramp of 0.18 * 2^EV (EV -10..+6) in
 * grey, orange, plum and teal was saved through AgX and AgX - Punchy with `save_render`, and this
 * model reproduces the Punchy ramp to RMS 1.7/255.
 *
 * The GLSL and the TypeScript reference below are the same maths; the tests pin the TypeScript
 * version to values read from Blender's ramp.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

export type AgxLook = "none" | "punchy";
export const AGX_LOOKS: readonly AgxLook[] = Object.freeze(["none", "punchy"]);

/** Fitted Punchy parameters, in Blender's AgX Log space (log2 range -12.47393 .. +12.52607). */
export const PUNCHY = Object.freeze({ power: 1.12, shadow: 0.02, start: 0.4, pivot: 0.05 });
const BLENDER_LOG_MIN = -12.47393;
const BLENDER_LOG_RANGE = 25;
/** three's AgX log window (Filament/Blender 3.x AgX). */
const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

type Vec3 = [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3]; // columns, as GLSL mat3(c0, c1, c2)

const SRGB_TO_REC2020: Mat3 = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956]];
const REC2020_TO_SRGB: Mat3 = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
const INSET: Mat3 = [
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
];
const OUTSET: Mat3 = [
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
];

function mul(m: Mat3, v: Vec3): Vec3 {
  return [0, 1, 2].map((r) => m[0][r] * v[0] + m[1][r] * v[1] + m[2][r] * v[2]) as Vec3;
}

function contrast(x: number): number {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

/** Punchy applied to one log2 exposure value (scene-linear stops). */
export function punchyEv(ev: number): number {
  let v = (ev - BLENDER_LOG_MIN) / BLENDER_LOG_RANGE;
  if (!(v > 0)) return ev;
  v = Math.pow(v, PUNCHY.power);
  const t = Math.min(1, Math.max(0, (v - PUNCHY.pivot) / (PUNCHY.start - PUNCHY.pivot)));
  v -= PUNCHY.shadow * 4 * t * (1 - t);
  return v * BLENDER_LOG_RANGE + BLENDER_LOG_MIN;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const oetf = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** Linear sRGB scene colour -> display-linear sRGB (0..1) through AgX with an optional look. */
export function agxDisplayLinear(rgb: readonly [number, number, number], exposure: number, look: AgxLook): Vec3 {
  let c = mul(INSET, mul(SRGB_TO_REC2020, [rgb[0] * exposure, rgb[1] * exposure, rgb[2] * exposure]));
  const ev = c.map((x) => Math.log2(Math.max(x, 1e-10)));
  const graded = look === "punchy" ? ev.map(punchyEv) : ev;
  c = graded.map((e) => contrast(clamp01((e - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV)))) as Vec3;
  c = mul(OUTSET, c).map((x) => Math.pow(Math.max(0, x), 2.2)) as Vec3;
  return mul(REC2020_TO_SRGB, c).map(clamp01) as Vec3;
}

/** Linear sRGB scene colour -> 8-bit sRGB display value, as a Blender render would save it. */
export function agxSrgb8(rgb: readonly [number, number, number], exposure: number, look: AgxLook): Vec3 {
  return agxDisplayLinear(rgb, exposure, look).map((c) => Math.round(oetf(c) * 255)) as Vec3;
}

const f = (n: number) => (n < 0 ? `(${n.toFixed(6)})` : n.toFixed(6));
const mat = (m: Mat3) => `mat3(${m.map((c) => `vec3(${c.map(f).join(", ")})`).join(", ")})`;

/**
 * GLSL: `vec3 nervixAgx( vec3 color )` maps exposed scene-linear sRGB to display-linear sRGB with
 * the Punchy look (when NERVIX_AGX_PUNCHY is 1). Prefixed names so it can sit next to three's
 * tone-mapping chunk without clashing.
 */
export function agxGlsl(look: AgxLook): string {
  return /* glsl */ `
#define NERVIX_AGX_PUNCHY ${look === "punchy" ? 1 : 0}
float nervixAgxContrast( float x ) {
  float x2 = x * x;
  float x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 nervixAgx( vec3 color ) {
  color = ${mat(INSET)} * ( ${mat(SRGB_TO_REC2020)} * color );
  vec3 ev = log2( max( color, vec3( 1e-10 ) ) );
#if NERVIX_AGX_PUNCHY == 1
  vec3 v = max( ( ev - ${f(BLENDER_LOG_MIN)} ) / ${f(BLENDER_LOG_RANGE)}, vec3( 0.0 ) );
  vec3 p = pow( v, vec3( ${f(PUNCHY.power)} ) );
  vec3 t = clamp( ( p - ${f(PUNCHY.pivot)} ) / ${f(PUNCHY.start - PUNCHY.pivot)}, 0.0, 1.0 );
  p -= ${f(PUNCHY.shadow)} * 4.0 * t * ( 1.0 - t );
  ev = mix( ev, p * ${f(BLENDER_LOG_RANGE)} + ${f(BLENDER_LOG_MIN)}, step( 1e-6, v ) );
#endif
  vec3 x = clamp( ( ev - ${f(AGX_MIN_EV)} ) / ${f(AGX_MAX_EV - AGX_MIN_EV)}, 0.0, 1.0 );
  color = vec3( nervixAgxContrast( x.r ), nervixAgxContrast( x.g ), nervixAgxContrast( x.b ) );
  color = pow( max( vec3( 0.0 ), ${mat(OUTSET)} * color ), vec3( 2.2 ) );
  return clamp( ${mat(REC2020_TO_SRGB)} * color, 0.0, 1.0 );
}
`;
}
