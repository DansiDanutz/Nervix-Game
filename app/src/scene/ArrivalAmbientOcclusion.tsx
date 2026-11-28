import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { agxOutputPass } from "./agxToneMapping";
import { renderTier, rendererName, type RenderTier } from "./renderTier";
import { BLOOM, FPS_GUARD_START, bloomThreshold, fxPlan, stepFpsGuard, type FpsGuard } from "./postFx";
import { aoBlendFor } from "./bakedLighting";
import { arrivalRig } from "./arrivalLighting";
import { ARRIVAL_ROOT } from "./ArrivalSquare";
import type { ArrivalMaterialStats } from "./arrivalMaterials";
import type { PlazaLighting } from "./slice";

/**
 * Arrival post-processing, GPU tier only (renderTier.ts): soft ground-truth ambient occlusion (GTAO)
 * for contact shadows on treads, basins and wall/ground junctions, and bloom so lanterns and glowing
 * glass halo like A01. The composer's OutputPass applies the renderer's tone mapping and sRGB, so the
 * frame matches the non-composited path apart from the effects.
 *
 * A frame-rate guard (postFx.ts) sheds AO samples, then AO, then bloom when the smoothed rate stays
 * under 50 fps; screen-space AO fades as more of the export carries Cycles-baked AO.
 */
const AO = Object.freeze({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1, distanceFallOff: 1, screenSpaceRadius: false });
const DENOISE = Object.freeze({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
/** Blend strength with no baked AO in the export: soft, not a dark outline. */
const AO_BLEND = 0.8;
const MSAA_SAMPLES = 4;
/** Priority > 0 takes over rendering from R3F for this canvas. */
const RENDER_PRIORITY = 1;
/** How often the AO blend re-reads the export's baked share (s). */
const BAKE_POLL_S = 1;

interface Chain {
  composer: EffectComposer;
  ao: GTAOPass;
  bloom: UnrealBloomPass;
  /** Follows the renderer exposure each frame (AgX - Punchy output pass only). */
  sync: (gl: THREE.WebGLRenderer) => void;
}

function buildChain(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, threshold: number): Chain {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: MSAA_SAMPLES });
  const composer = new EffectComposer(gl, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ ...AO, samples: fxPlan("gpu", 0).aoSamples });
  ao.updatePdMaterial({ ...DENOISE });
  ao.blendIntensity = AO_BLEND;
  composer.addPass(ao);
  // UnrealBloomPass downsamples internally (first mip at half size); the threshold is in linear HDR.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, threshold);
  composer.addPass(bloom);
  // CustomToneMapping is the AgX - Punchy view (agxToneMapping.ts); the output pass applies it itself.
  if (gl.toneMapping === THREE.CustomToneMapping) {
    const output = agxOutputPass();
    composer.addPass(output);
    return { composer, ao, bloom, sync: output.sync };
  }
  composer.addPass(new OutputPass());
  return { composer, ao, bloom, sync: () => undefined };
}

interface FxState {
  tier: RenderTier;
  level: number;
  fps: number;
  ao: boolean;
  bloom: boolean;
  aoBlend: number;
  /** Share of arrival meshes drawn from the Cycles bake, and materials carrying surface detail. */
  bakedFraction?: number;
  detailed?: number;
}

function publishFx(state: FxState) {
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervixFx = state;
}

function PostChain({ threshold }: { threshold: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // Built in an effect (not a memo) so StrictMode's mount/unmount/mount never renders a disposed composer.
  const [chain, setChain] = useState<Chain | null>(null);
  const guard = useRef<FpsGuard>(FPS_GUARD_START);
  const applied = useRef(-1);
  const bake = useRef({ since: BAKE_POLL_S, blend: AO_BLEND });

  useEffect(() => {
    const built = buildChain(gl, scene, camera, threshold);
    setChain(built);
    applied.current = -1;
    return () => {
      for (const pass of built.composer.passes) pass.dispose();
      built.composer.dispose();
    };
  }, [gl, scene, camera, threshold]);
  useEffect(() => {
    if (!chain) return;
    chain.composer.setPixelRatio(gl.getPixelRatio());
    chain.composer.setSize(size.width, size.height);
  }, [chain, gl, size.width, size.height]);

  useFrame((_, delta) => {
    if (!chain) {
      gl.render(scene, camera);
      return;
    }
    const g = (guard.current = stepFpsGuard(guard.current, delta));
    const plan = fxPlan("gpu", g.level);
    if (applied.current !== g.level) {
      applied.current = g.level;
      chain.ao.enabled = plan.ao;
      if (plan.ao) chain.ao.updateGtaoMaterial({ samples: plan.aoSamples });
      chain.bloom.enabled = plan.bloom;
    }
    bake.current.since += delta;
    if (bake.current.since >= BAKE_POLL_S) {
      bake.current.since = 0;
      const stats = scene.getObjectByName(ARRIVAL_ROOT)?.children[0]?.userData.arrivalMaterials as ArrivalMaterialStats | undefined;
      bake.current.blend = aoBlendFor(AO_BLEND, stats?.bakedFraction ?? 0);
      chain.ao.blendIntensity = bake.current.blend;
      publishFx({
        tier: "gpu",
        level: g.level,
        fps: Math.round(g.fps),
        ao: plan.ao,
        bloom: plan.bloom,
        aoBlend: bake.current.blend,
        bakedFraction: stats?.bakedFraction ?? 0,
        detailed: stats?.detailed ?? 0,
      });
    }
    chain.sync(gl);
    if (plan.ao || plan.bloom) chain.composer.render(delta);
    else gl.render(scene, camera);
  }, RENDER_PRIORITY);
  return null;
}

/** Mounts the post chain only on hardware GPUs; software rasterisers keep plain rendering. */
export function ArrivalAmbientOcclusion({ lighting }: { lighting: PlazaLighting }) {
  const gl = useThree((s) => s.gl);
  const tier = useMemo(() => renderTier(rendererName(gl.getContext())), [gl]);
  const rig = arrivalRig(lighting);
  const threshold = bloomThreshold(rig.sun.intensity, rig.hemisphere.intensity);
  useEffect(() => {
    if (tier !== "gpu") publishFx({ tier, level: 0, fps: 0, ao: false, bloom: false, aoBlend: 0 });
  }, [tier]);
  return tier === "gpu" ? <PostChain threshold={threshold} /> : null;
}
