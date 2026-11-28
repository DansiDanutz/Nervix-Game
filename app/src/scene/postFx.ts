/**
 * Arrival post-processing plan: view transform, which screen-space passes run, and a frame-rate
 * guard that sheds passes when the GPU cannot hold the budget.
 *
 * - Software rasterisers (SwiftShader, llvmpipe) never run post passes (see renderTier.ts).
 * - On the GPU the plan starts at full quality (GTAO 16 samples + bloom) and steps down one level
 *   each time the smoothed frame rate stays under MIN_FPS for LOW_HOLD_S, after a warm-up that
 *   ignores shader-compile hitches. It never steps back up, so it cannot oscillate.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */
import type { RenderTier } from "./renderTier";
import type { AgxLook } from "./agxLook";

export type ToneMappingName = "aces" | "agx" | "neutral";
export interface ViewTransform {
  toneMapping: ToneMappingName;
  exposure: number;
  /** Blender look on top of AgX; always "none" for the other transforms. */
  look: AgxLook;
}

/**
 * Default arrival view: ACES filmic with sRGB output. three's ACES already scales by 1/0.6, so an
 * exposure near 1 lands sunlit stone at Blender's lightness. The manifest may override it
 * (lighting.view) to match the view transform the bake was graded under.
 */
export const ARRIVAL_VIEW_DEFAULT: Readonly<ViewTransform> = Object.freeze({ toneMapping: "aces", exposure: 1.0, look: "none" });

/**
 * build_arrival_slice.py renders with AgX and the "AgX - Punchy" look, so an AgX view without an
 * explicit look takes Punchy (agxLook.ts): skipping it leaves the game ~1 stop lighter in the mids.
 */
export const AGX_DEFAULT_LOOK: AgxLook = "punchy";

export function arrivalView(view?: Partial<ViewTransform>): ViewTransform {
  const toneMapping = view?.toneMapping ?? ARRIVAL_VIEW_DEFAULT.toneMapping;
  const look = toneMapping === "agx" ? view?.look ?? AGX_DEFAULT_LOOK : "none";
  return { toneMapping, exposure: view?.exposure ?? ARRIVAL_VIEW_DEFAULT.exposure, look };
}

export interface FxPlan {
  ao: boolean;
  aoSamples: number;
  bloom: boolean;
}

const OFF: FxPlan = Object.freeze({ ao: false, aoSamples: 0, bloom: false });
/** Quality ladder, best first. Bloom at half resolution is cheaper than GTAO, so AO goes first. */
export const FX_LEVELS: readonly FxPlan[] = Object.freeze([
  Object.freeze({ ao: true, aoSamples: 16, bloom: true }),
  Object.freeze({ ao: true, aoSamples: 8, bloom: true }),
  Object.freeze({ ao: false, aoSamples: 0, bloom: true }),
  OFF,
]);

export function fxPlan(tier: RenderTier, level: number): FxPlan {
  if (tier !== "gpu") return OFF;
  return FX_LEVELS[Math.min(Math.max(0, Math.floor(level)), FX_LEVELS.length - 1)];
}

/** Frame-rate floor for the arrival at 1280x720 (V2 budget). */
export const MIN_FPS = 50;
/** Ignore the first seconds: shader compilation and GLB upload hitch. */
export const WARMUP_S = 3;
/** The smoothed rate must stay low this long before a step down. */
export const LOW_HOLD_S = 2;
/** Smoothing time constant of the frame-rate estimate. */
const EMA_TAU_S = 0.5;
/** Frames longer than this are tab switches or debugger pauses, not load. */
const MAX_DT_S = 0.25;

export interface FpsGuard {
  level: number;
  elapsed: number;
  fps: number;
  lowFor: number;
}

export const FPS_GUARD_START: Readonly<FpsGuard> = Object.freeze({ level: 0, elapsed: 0, fps: 60, lowFor: 0 });

/** Advance the guard by one frame of `dt` seconds; returns a new state. */
export function stepFpsGuard(g: FpsGuard, dt: number): FpsGuard {
  if (!(dt > 0) || dt > MAX_DT_S) return { ...g, lowFor: 0 };
  const elapsed = g.elapsed + dt;
  const k = 1 - Math.exp(-dt / EMA_TAU_S);
  const fps = g.fps + (1 / dt - g.fps) * k;
  if (elapsed < WARMUP_S) return { ...g, elapsed, fps };
  const lowFor = fps < MIN_FPS ? g.lowFor + dt : 0;
  const last = FX_LEVELS.length - 1;
  if (lowFor >= LOW_HOLD_S && g.level < last) return { level: g.level + 1, elapsed: WARMUP_S - LOW_HOLD_S, fps: MIN_FPS, lowFor: 0 };
  return { level: g.level, elapsed, fps, lowFor };
}

/**
 * Bloom threshold in linear scene luminance, above the brightest sunlit diffuse surface
 * (albedo <= ~0.85 under sun + sky), so only lamps, glowing glass and gold glints bloom.
 */
const DIFFUSE_PEAK_ALBEDO = 0.85;
const BLOOM_HEADROOM = 1.25;
export function bloomThreshold(sunIntensity: number, hemisphereIntensity: number): number {
  const peak = (DIFFUSE_PEAK_ALBEDO * Math.max(0, sunIntensity)) / Math.PI + DIFFUSE_PEAK_ALBEDO * Math.max(0, hemisphereIntensity) * 0.5;
  return +Math.max(1, peak * BLOOM_HEADROOM).toFixed(3);
}
/** UnrealBloomPass strength and radius (it downsamples internally from half resolution). */
export const BLOOM = Object.freeze({ strength: 0.55, radius: 0.45 });
