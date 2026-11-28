import { useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { renderTier, rendererName } from "./renderTier";

/**
 * Soft ground-truth ambient occlusion (GTAO) for the arrival square, GPU tier only.
 * Without it stair treads, fountain basins and wall/ground junctions have no contact shadow and
 * the stone reads as cardboard. A small world radius keeps it to contact darkening rather than
 * dirty halos; the composer's OutputPass applies the renderer's AgX tone mapping and sRGB, so the
 * frame matches the non-composited path apart from the occlusion.
 */
const AO = Object.freeze({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
const DENOISE = Object.freeze({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
/** Blend strength: soft, not a dark outline. */
const AO_BLEND = 0.8;
const MSAA_SAMPLES = 4;
/** Priority > 0 takes over rendering from R3F for this canvas. */
const RENDER_PRIORITY = 1;

function buildComposer(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: MSAA_SAMPLES });
  const composer = new EffectComposer(gl, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ ...AO });
  ao.updatePdMaterial({ ...DENOISE });
  ao.blendIntensity = AO_BLEND;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return composer;
}

function AoComposer() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // Built in an effect (not a memo) so StrictMode's mount/unmount/mount never renders a disposed composer.
  const [composer, setComposer] = useState<EffectComposer | null>(null);
  useEffect(() => {
    const built = buildComposer(gl, scene, camera);
    setComposer(built);
    return () => {
      for (const pass of built.passes) pass.dispose();
      built.dispose();
    };
  }, [gl, scene, camera]);
  useEffect(() => {
    if (!composer) return;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size.width, size.height]);

  useFrame((_, delta) => {
    if (composer) composer.render(delta);
    else gl.render(scene, camera);
  }, RENDER_PRIORITY);
  return null;
}

/** Mounts the AO composer only on hardware GPUs; software rasterisers keep plain rendering. */
export function ArrivalAmbientOcclusion() {
  const gl = useThree((s) => s.gl);
  const tier = useMemo(() => renderTier(rendererName(gl.getContext())), [gl]);
  return tier === "gpu" ? <AoComposer /> : null;
}
