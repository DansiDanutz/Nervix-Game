import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { gradeLinear, type ColorGrade } from "./materialGrade";

type MaterialGrades = Readonly<Record<string, ColorGrade>>;

/** Any metallic paint (gold, brass, iron, satin domes) reflects the sky, as in Blender. */
const METAL_THRESHOLD = 0.05;
const REFLECTION_BLUR = 0.04;
/** Where the sky/ground gradient turns over, in unit-sphere height. */
const HORIZON_LOW = -0.2;
const HORIZON_HIGH = 0.3;

/**
 * A blurred sky/ground gradient as a PMREM reflection map. Without one, three.js renders fully
 * metallic paint (gold inlays, finials, brass, spade emblems) black, where Blender reflects its world.
 */
function skyReflection(gl: THREE.WebGLRenderer, sky: string, ground: string) {
  const geometry = new THREE.SphereGeometry(1, 32, 16);
  const top = new THREE.Color(sky);
  const bottom = new THREE.Color(ground);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(bottom).lerp(top, THREE.MathUtils.smoothstep(pos.getY(i), HORIZON_LOW, HORIZON_HIGH)).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  const envScene = new THREE.Scene().add(new THREE.Mesh(geometry, material));
  const pmrem = new THREE.PMREMGenerator(gl);
  const target = pmrem.fromScene(envScene, REFLECTION_BLUR);
  pmrem.dispose();
  geometry.dispose();
  material.dispose();
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
  const reflects = !!env && std.metalness >= METAL_THRESHOLD;
  const correction = grade?.[m.name];
  if (!reflects && !correction) return m;
  const copy = std.clone();
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
 * and whose named materials get an optional colour grade.
 * The shared GLTF cache is never mutated: affected materials are cloned per instance.
 */
export function useLitClone(scene: THREE.Object3D, sky: string, ground: string, grade?: MaterialGrades) {
  const gl = useThree((s) => s.gl);
  // Built in an effect (not a memo) so StrictMode's mount/unmount/mount never disposes the live map.
  const [reflection, setReflection] = useState<THREE.WebGLRenderTarget | null>(null);
  useEffect(() => {
    const target = skyReflection(gl, sky, ground);
    setReflection(target);
    return () => target.dispose();
  }, [gl, sky, ground]);

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
