/**
 * Skinned avatar (C7): the K1 rigged pedestrian (kits/k1/k1_pedestrian.glb) dressed as a preset
 * (parts and material slots from the K1 manifest) and animated by one AnimationMixer that the
 * locomotion state machine (world/locomotion.ts) blends between idle, walk and run by speed.
 * Walk and run are driven from one shared normalised gait phase (gaitCycleRate), so their legs stay
 * in step while blended; idle plays on its own clock. The kit manifest is loaded once for all
 * avatars (world3d/k1Dress.ts).
 *
 * The outer group turns smoothly toward the direction of travel, so the parent must not set
 * rotation.y itself. Until the kit loads, or if it fails, `fallback` is drawn inside the same
 * turning group. Not mounted yet: the lead applies the hookup in the scene wave.
 */
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { resolvePreset, type K1Kit } from "../world/locomotionKit";
import {
  advanceGaitPhase, createLocomotion, gaitCycleRate, stepLocomotion, type Locomotion, type LocomotionSample,
} from "../world/locomotion";
import { K1_KIT_DIR, dressK1, useK1Kit } from "./k1Dress";
const CLIPS = ["idle", "walk", "run"] as const;
/** Longest mixer step (s): a stalled tab resumes mid-stride instead of skipping cycles. */
const MAX_MIXER_STEP_S = 0.1;
/** DEV hook refresh interval for E2E (ms). */
const DEBUG_EVERY_MS = 100;

/** Anything with a current position sample: playerState.ref, or a remote player's pose ref. */
export interface LocomotionSource {
  readonly current: LocomotionSample;
}

interface LocoRef {
  current: Locomotion;
}

function Dressed({ kit, preset, loco }: { kit: K1Kit; preset: string; loco: LocoRef }) {
  const { scene, animations } = useGLTF(`${K1_KIT_DIR}/${kit.glb}`);
  const presetId = resolvePreset(kit, preset);
  const dressed = useMemo(() => dressK1(scene, kit, presetId), [scene, kit, presetId]);
  const mixer = useMemo(() => new THREE.AnimationMixer(dressed.root), [dressed]);
  const actions = useMemo(
    () => CLIPS.map((name) => {
      const clip = THREE.AnimationClip.findByName(animations, name);
      return clip ? { name, action: mixer.clipAction(clip) } : null;
    }).filter((a): a is { name: (typeof CLIPS)[number]; action: THREE.AnimationAction } => a !== null),
    [animations, mixer],
  );

  useEffect(() => {
    actions.forEach(({ action }) => action.reset().setEffectiveWeight(0).play());
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(dressed.root);
    };
  }, [actions, mixer, dressed]);
  useEffect(() => () => dressed.created.forEach((m) => m.dispose()), [dressed]);

  const durations = useMemo(() => {
    const length = (name: string) => actions.find((a) => a.name === name)?.action.getClip().duration ?? 0;
    return Object.freeze({ walk: length("walk"), run: length("run") });
  }, [actions]);
  const phase = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_MIXER_STEP_S);
    const { weights, rates } = loco.current;
    phase.current = advanceGaitPhase(phase.current, dt, gaitCycleRate(weights, rates, durations));
    for (const { name, action } of actions) {
      action.setEffectiveWeight(weights[name]);
      if (name === "idle") {
        action.setEffectiveTimeScale(rates.idle);
        continue;
      }
      // Gait clips are posed from the shared phase, not their own clocks, so blended legs stay in step.
      action.setEffectiveTimeScale(0);
      action.time = phase.current * durations[name];
    }
    mixer.update(dt);
  });

  return <primitive object={dressed.root} name={`skinned_avatar_${presetId}`} />;
}

/** A broken kit GLB falls back to `fallback`, never an empty player. */
class KitBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn(`[avatar] skinned avatar disabled: ${error.message}`);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** DEV-only test hook (future E2E): the local player's locomotion state. */
function publishDebug(loco: Locomotion): void {
  if (!import.meta.env?.DEV) return;
  const { state, speed, weights } = loco;
  (window as unknown as Record<string, unknown>).__nervixLocomotion = Object.freeze({
    state,
    speed: +speed.toFixed(2),
    weights: Object.freeze({ idle: +weights.idle.toFixed(2), walk: +weights.walk.toFixed(2), run: +weights.run.toFixed(2) }),
  });
}

export interface SkinnedAvatarProps {
  /** Avatar preset id (shared/contracts/avatar-presets.json). */
  readonly preset: string;
  readonly source: LocomotionSource;
  /** Initial rotation.y before the first movement (0 faces +z). */
  readonly initialHeading?: number;
  /** Publish window.__nervixLocomotion (local player only). */
  readonly debug?: boolean;
  readonly fallback?: ReactNode;
}

export function SkinnedAvatar({ preset, source, initialHeading = 0, debug = false, fallback = null }: SkinnedAvatarProps) {
  const kit = useK1Kit();
  const loco = useRef<Locomotion>(createLocomotion(initialHeading));
  const facing = useRef<THREE.Group | null>(null);
  const lastDebug = useRef(0);

  useFrame(() => {
    loco.current = stepLocomotion(loco.current, source.current);
    if (facing.current) facing.current.rotation.y = loco.current.heading;
    const now = performance.now();
    if (debug && now - lastDebug.current > DEBUG_EVERY_MS) {
      lastDebug.current = now;
      publishDebug(loco.current);
    }
  });

  return (
    <group ref={facing} name="skinned_avatar">
      {kit ? (
        <KitBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <Dressed kit={kit} preset={preset} loco={loco} />
          </Suspense>
        </KitBoundary>
      ) : (
        fallback
      )}
    </group>
  );
}
