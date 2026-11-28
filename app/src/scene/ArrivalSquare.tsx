import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlazaLayout, PlazaLighting } from "./slice";
import { useLitClone } from "./metalReflection";
import { arrivalRig } from "./arrivalLighting";
import { skyMaterial } from "./skyShader";
import { sunDirection } from "./fountainWater";
import { useArrivalMaterials } from "./arrivalMaterials";
import { ARRIVAL_MATERIAL_GRADE } from "./materialGrade";
import { renderTier, rendererName } from "./renderTier";

export const ARRIVAL_ROOT = "arrival_square";
export const arrivalUrl = (plaza: PlazaLayout) => `/slice/${plaza.glb}`;

const SHADOW_EXTENT = 36; // metres either side of the sun target: covers the square and the street
const SHADOW_MAP = 2048;
/** Sky dome just inside the camera far plane (far = fog.far * 1.5), so it is never clipped. */
const SKY_RADIUS_OF_FOG_FAR = 1.4;

/**
 * Blender's ArrivalWorld (six-stop ramp and cream cloud banks, skyRamp.ts) drawn as a tone-mapped
 * shader dome (skyShader.ts): Blender's camera sees its sky through the same view transform as the
 * buildings, while a scene background skips it.
 */
function SkyDome({ radius }: { radius: number }) {
  const time = useMemo(() => ({ value: 0 }), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(radius, 48, 24), [radius]);
  const material = useMemo(() => skyMaterial(time), [time]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => {
    time.value += delta;
  });
  return <mesh renderOrder={-1} frustumCulled={false} geometry={geometry} material={material} />;
}

/**
 * Warm golden-hour lighting from the manifest, graded against the Blender render and A01: an
 * amber sun, a peach-leaning sky over a terracotta ground, and an amber bounce opposite the sun
 * (see arrivalLighting.ts).
 * Rendered as a direct child of the Canvas so background/fog attach to the scene,
 * and outside Suspense so the first frame is already lit.
 */
export function ArrivalLighting({ lighting }: { lighting: PlazaLighting }) {
  const { background } = lighting;
  const rig = arrivalRig(lighting);
  const { sun, fog } = rig;
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[fog.color, fog.near, fog.far]} />
      {/* Sized from the exported fog range, like the camera far plane (SceneView), not the graded fog. */}
      <SkyDome radius={lighting.fog.far * SKY_RADIUS_OF_FOG_FAR} />
      <hemisphereLight args={[rig.hemisphere.sky, rig.hemisphere.ground, rig.hemisphere.intensity]} />
      <directionalLight position={rig.fill.position} color={rig.fill.color} intensity={rig.fill.intensity} />
      <directionalLight
        position={sun.position}
        color={sun.color}
        intensity={sun.intensity}
        castShadow
        shadow-mapSize-width={SHADOW_MAP}
        shadow-mapSize-height={SHADOW_MAP}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={0.5}
        shadow-camera-far={Math.hypot(...sun.position) + SHADOW_EXTENT * 2}
      />
    </>
  );
}

/** The Blender arrival square (A01), drawn exactly where Blender placed it (district frame). */
export function ArrivalSquare({ plaza }: { plaza: PlazaLayout }) {
  const { scene } = useGLTF(arrivalUrl(plaza));
  const gl = useThree((s) => s.gl);
  // Surface detail over the bake is a per-pixel cost: GPU tier only (renderTier.ts).
  const detail = useMemo(() => renderTier(rendererName(gl.getContext())) === "gpu", [gl]);
  const { hemisphere, sky, sun } = arrivalRig(plaza.lighting);
  const toSun = sunDirection(sun.position);
  const [tx, ty, tz] = toSun;
  const reflectionSun = useMemo(() => ({ direction: [tx, ty, tz] as const, color: sun.color }), [tx, ty, tz, sun.color]);
  const root = useLitClone(scene, hemisphere.sky, hemisphere.ground, ARRIVAL_MATERIAL_GRADE, reflectionSun);
  // Baked-lighting contract, surface detail over the bake and the animated fountain water (arrivalMaterials.ts).
  useArrivalMaterials(root, {
    center: [plaza.fountain.x, plaza.fountain.z],
    sky: sky.mid ?? sky.horizon,
    sunDirection: toSun,
    sunColor: sun.color,
    detail,
  });
  return (
    <group name={ARRIVAL_ROOT}>
      <primitive object={root} />
    </group>
  );
}

/** A missing or broken arrival GLB must not take the whole canvas down. */
export class ArrivalBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(`Arrival square failed to load (${error.message}); showing the legacy district.`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ---------------------------------------------------------------- dev probe */

const PROBE_INTERVAL_S = 0.25;
const SIGHTLINE_AIM = 0.8; // aim at the upper column (fraction of top_y): the top finial is too thin to hit reliably

export interface ArrivalProbeState {
  loaded: boolean;
  fountainScreen: { x: number; y: number };
  avatarScreen: { minX: number; maxX: number; minY: number; maxY: number } | null;
  /** NDC centre of the cafe awning (A01 left anchor); null when the GLB has no cafe_awning. */
  cafeScreen: { x: number; y: number } | null;
  sightline: string | null;
  alerts: string[];
}

const round = (n: number) => +n.toFixed(3);
const CAFE_NODE = "cafe_awning";

function hitName(o: THREE.Object3D): string {
  for (let cur: THREE.Object3D | null = o; cur && cur.name !== ARRIVAL_ROOT; cur = cur.parent) {
    if (cur.name.toLowerCase().startsWith("fountain")) return cur.name;
  }
  return o.name || o.type;
}

function seen(hit: THREE.Intersection) {
  for (let cur: THREE.Object3D | null = hit.object; cur; cur = cur.parent) if (!cur.visible) return false;
  const mats = ([] as THREE.Material[]).concat((hit.object as THREE.Mesh).material ?? []);
  return !mats.every((m) => m.transparent && m.opacity === 0);
}

function visibleAlerts() {
  return Array.from(document.querySelectorAll<HTMLElement>("[role=alert]"))
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.textContent?.trim() ?? "");
}

/**
 * DEV only: window.__nervixArrival for the arrival E2E (composition checks).
 * Updated ~4x per second; nothing here runs in production builds.
 */
export function ArrivalProbe({ fountain }: { fountain: PlazaLayout["fountain"] }) {
  const { camera, scene } = useThree();
  const last = useRef(-Infinity);
  const tools = useMemo(() => ({ ray: new THREE.Raycaster(), box: new THREE.Box3(), v: new THREE.Vector3() }), []);

  useEffect(
    () => () => {
      delete (window as unknown as Record<string, unknown>).__nervixArrival;
    },
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t - last.current < PROBE_INTERVAL_S) return;
    last.current = t;
    camera.updateMatrixWorld();
    const { ray, box, v } = tools;

    const top = v.set(fountain.x, fountain.topY, fountain.z).project(camera);
    const fountainScreen = { x: round(top.x), y: round(top.y) };

    const player = scene.getObjectByName("player");
    let avatarScreen: ArrivalProbeState["avatarScreen"] = null;
    if (player) {
      box.setFromObject(player);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
        v.set(cx, cy, cz).project(camera);
        xs.push(v.x);
        ys.push(v.y);
      }
      avatarScreen = { minX: round(Math.min(...xs)), maxX: round(Math.max(...xs)), minY: round(Math.min(...ys)), maxY: round(Math.max(...ys)) };
    }

    const cafe = scene.getObjectByName(ARRIVAL_ROOT)?.getObjectByName(CAFE_NODE);
    let cafeScreen: ArrivalProbeState["cafeScreen"] = null;
    if (cafe) {
      box.setFromObject(cafe).getCenter(v).project(camera);
      cafeScreen = { x: round(v.x), y: round(v.y) };
    }

    const aim = v.set(fountain.x, fountain.topY * SIGHTLINE_AIM, fountain.z);
    const dir = aim.clone().sub(camera.position).normalize();
    ray.set(camera.position, dir);
    const first = ray.intersectObjects(scene.children, true).find(seen);

    const state: ArrivalProbeState = {
      loaded: !!scene.getObjectByName(ARRIVAL_ROOT)?.children.length,
      fountainScreen,
      avatarScreen,
      cafeScreen,
      sightline: first ? hitName(first.object) : null,
      alerts: visibleAlerts(),
    };
    (window as unknown as Record<string, unknown>).__nervixArrival = state;
  });

  return null;
}
