import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { renderTier, rendererName } from "./renderTier";
import { PLAZA_WALKERS, clearWalkers, parseK1, samplePath, visibleNodes, type K1Kit, type WalkerPlan } from "./plazaWalkers";
import type { PlazaLayout } from "./slice";
import { ContactShadow } from "./ContactShadow";

/**
 * Animated ambient pedestrians on the arrival square (People gap, A01 / A13-A15): K1 rigged kit
 * presets walking the fountain arc and the street, and a talking pair by the casino steps.
 * Dynamic, so they stay lit by the runtime rig (tuned to match the bake). GPU tier only: the
 * software rasteriser already sits near its frame-rate floor.
 */
const KIT_DIR = "/kits/k1";
const CROSSFADE_S = 0.3;
/** K1 figure height (kit manifest height_m). */
const FIGURE_HEIGHT_M = 1.8;

function useKit(): K1Kit | null {
  const [kit, setKit] = useState<K1Kit | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${KIT_DIR}/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => live && setKit(parseK1(json)))
      .catch((e: unknown) => console.warn(`[arrival] pedestrian kit unavailable: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
    };
  }, []);
  return kit;
}

/** A skinned copy of the kit dressed as `presetId`; recoloured materials are owned by the copy. */
function dress(scene: THREE.Object3D, kit: K1Kit, presetId: string) {
  const root = cloneSkinned(scene);
  const show = visibleNodes(kit, presetId);
  const partNodes = new Set(kit.parts.map((p) => p.node));
  const palette = kit.presets.find((p) => p.id === presetId)?.palette ?? {};
  const slotByMaterial = new Map(Object.entries(kit.slots).map(([slot, name]) => [name, slot]));
  const created: THREE.Material[] = [];
  const recoloured = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    if (partNodes.has(o.name)) o.visible = show.has(o.name);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // skinned bounds follow the bind pose, not the animation
    const recolour = (m: THREE.Material) => {
      const hex = palette[slotByMaterial.get(m.name) ?? ""];
      const std = m as THREE.MeshStandardMaterial;
      if (!hex || !std.isMeshStandardMaterial) return m;
      const known = recoloured.get(m);
      if (known) return known;
      const copy = std.clone();
      copy.color = new THREE.Color(hex);
      recoloured.set(m, copy);
      created.push(copy);
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolour) : recolour(mesh.material);
  });
  return { root, created };
}

function Walker({ plan, kit }: { plan: WalkerPlan; kit: K1Kit }) {
  const { scene, animations } = useGLTF(`${KIT_DIR}/${kit.glb}`);
  const dressed = useMemo(() => dress(scene, kit, plan.preset), [scene, kit, plan.preset]);
  const mixer = useMemo(() => new THREE.AnimationMixer(dressed.root), [dressed]);
  const travelled = useRef(plan.offset);

  useEffect(() => {
    const clip = THREE.AnimationClip.findByName(animations, plan.clip) ?? THREE.AnimationClip.findByName(animations, "idle");
    if (!clip) return;
    const action = mixer.clipAction(clip);
    // De-phase identical clips so the cast does not step in unison.
    action.reset().fadeIn(CROSSFADE_S).play();
    action.time = (plan.offset * 0.37) % clip.duration;
    return () => {
      action.stop();
      mixer.uncacheRoot(dressed.root);
    };
  }, [animations, mixer, plan.clip, plan.offset, dressed]);
  useEffect(() => () => dressed.created.forEach((m) => m.dispose()), [dressed]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    mixer.update(dt);
    travelled.current += plan.speed * dt;
    const pose = samplePath(plan.path, travelled.current);
    dressed.root.position.set(pose.x, 0, pose.z);
    dressed.root.rotation.y = plan.speed > 0 ? pose.heading : plan.yaw ?? 0;
  });

  return (
    <primitive object={dressed.root} name={`pedestrian_${plan.id}`}>
      <ContactShadow height={FIGURE_HEIGHT_M} />
    </primitive>
  );
}

/** A broken kit GLB only loses the pedestrians, never the square. */
class PedestrianBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn(`[arrival] pedestrians disabled: ${error.message}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Mounts the cast on GPU renderers once the kit manifest has loaded. */
export function Pedestrians({ plaza }: { plaza: PlazaLayout }) {
  const gl = useThree((s) => s.gl);
  const tier = useMemo(() => renderTier(rendererName(gl.getContext())), [gl]);
  const kit = useKit();
  const cast = useMemo(() => clearWalkers(PLAZA_WALKERS, plaza.obstacles, plaza.bounds), [plaza.obstacles, plaza.bounds]);
  if (tier !== "gpu" || !kit) return null;
  return (
    <PedestrianBoundary>
      <group name="arrival_pedestrians">
        {cast.map((plan) => (
          <Suspense key={plan.id} fallback={null}>
            <Walker plan={plan} kit={kit} />
          </Suspense>
        ))}
      </group>
    </PedestrianBoundary>
  );
}
