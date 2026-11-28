import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { gradeLinear, polishedMetal, type ColorGrade } from "./materialGrade";
import { BLENDER_WORLD, rampSegment } from "./skyRamp";

type MaterialGrades = Readonly<Record<string, ColorGrade>>;

/** Any metallic paint (gold, brass, iron, satin domes) reflects the sky, as in Blender. */
const METAL_THRESHOLD = 0.05;
const REFLECTION_BLUR = 0.04;
/** Where the sky/ground gradient turns over, in unit-sphere height. */
const HORIZON_LOW = -0.2;
const HORIZON_HIGH = 0.3;
/**
 * Sun disc in the reflection map: Blender's sun lamp lights glossy gold with a hot highlight, which a
 * gradient alone never gives. Angular radius (rad) and HDR gain over the sun colour; PMREM keeps it
 * as a tight glint at roughness ~0.2 and spreads it on rougher paints.
 */
const SUN_DISC_RADIUS = 0.06;
const SUN_DISC_GAIN = 24;
const ENV_SUN_DISTANCE = 0.9;

export interface ReflectionSun {
  /** Unit vector toward the sun. */
  direction: readonly [number, number, number];
  color: string;
}

/**
 * A blurred sky/ground gradient as a PMREM reflection map. Without one, three.js renders fully
 * metallic paint (gold inlays, finials, brass, spade emblems) black, where Blender reflects its world.
 */
function skyReflection(gl: THREE.WebGLRenderer, sky: string, ground: string, sun?: ReflectionSun) {
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const top = new THREE.Color(sky);
  const bottom = new THREE.Color(ground);
  // With a sun (the arrival), the upper sky is Blender's ArrivalWorld ramp, as the sky dome draws it.
  const stops = BLENDER_WORLD.stops.map((s) => new THREE.Color(s.color).multiplyScalar(BLENDER_WORLD.strength));
  const positions = BLENDER_WORLD.stops.map((s) => s.position);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const above = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (sun) {
      const { index, t } = rampSegment(positions, Math.max(0, y));
      above.lerpColors(stops[index], stops[Math.min(index + 1, stops.length - 1)], t);
    } else above.copy(top);
    c.copy(bottom).lerp(above, THREE.MathUtils.smoothstep(y, HORIZON_LOW, HORIZON_HIGH)).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  const envScene = new THREE.Scene().add(new THREE.Mesh(geometry, material));
  const extras: { dispose(): void }[] = [];
  if (sun) {
    const discGeometry = new THREE.SphereGeometry(SUN_DISC_RADIUS, 12, 8);
    const discMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(sun.color).multiplyScalar(SUN_DISC_GAIN) });
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    disc.position.set(...sun.direction).normalize().multiplyScalar(ENV_SUN_DISTANCE);
    envScene.add(disc);
    extras.push(discGeometry, discMaterial);
  }
  const pmrem = new THREE.PMREMGenerator(gl);
  const target = pmrem.fromScene(envScene, REFLECTION_BLUR);
  pmrem.dispose();
  geometry.dispose();
  material.dispose();
  for (const e of extras) e.dispose();
  return target;
}

/**
 * The material as drawn: a copy when it is metallic (reflects the sky) or has a colour grade
 * (see materialGrade.ts); other materials are returned unchanged. The original is never mutated.
 */
function prepared(m: THREE.Material, env: THREE.Texture | null, grade: MaterialGrades | undefined, cache: Map<THREE.Material, THREE.Material>) {
  const known = cache.get(m);
  if (known) return known;
  const std = m as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return m;
  const polish = polishedMetal(m.name, std.metalness, std.roughness);
  const polished = polish.metalness !== std.metalness || polish.roughness !== std.roughness;
  const reflects = !!env && polish.metalness >= METAL_THRESHOLD;
  const correction = grade?.[m.name];
  if (!reflects && !correction && !polished) return m;
  const copy = std.clone();
  copy.metalness = polish.metalness;
  copy.roughness = polish.roughness;
  if (reflects) copy.envMap = env;
  if (correction) {
    const [r, g, b] = gradeLinear([std.color.r, std.color.g, std.color.b], correction);
    copy.color = new THREE.Color().setRGB(r, g, b);
  }
  cache.set(m, copy);
  return copy;
}

/**
 * A shadow-casting clone of a GLB scene whose metallic materials reflect a sky/ground gradient
 * (Blender's sky ramp and a sun glint when `sun` is given), whose gilding and brass are polished
 * (materialGrade.ts POLISHED_METALS) and whose named materials get an optional colour grade.
 * The shared GLTF cache is never mutated: affected materials are cloned per instance.
 */
export function useLitClone(scene: THREE.Object3D, sky: string, ground: string, grade?: MaterialGrades, sun?: ReflectionSun) {
  const gl = useThree((s) => s.gl);
  // Built in an effect (not a memo) so StrictMode's mount/unmount/mount never disposes the live map.
  const [reflection, setReflection] = useState<THREE.WebGLRenderTarget | null>(null);
  const [dx, dy, dz] = sun?.direction ?? [0, 0, 0];
  const sunColor = sun?.color;
  useEffect(() => {
    const target = skyReflection(gl, sky, ground, sunColor ? { direction: [dx, dy, dz], color: sunColor } : undefined);
    setReflection(target);
    return () => target.dispose();
  }, [gl, sky, ground, dx, dy, dz, sunColor]);

  return useMemo(() => {
    const clone = scene.clone(true);
    const copies = new Map<THREE.Material, THREE.Material>();
    const env = reflection?.texture ?? null;
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => prepared(m, env, grade, copies))
        : prepared(mesh.material, env, grade, copies);
    });
    return clone;
  }, [scene, reflection, grade]);
}
