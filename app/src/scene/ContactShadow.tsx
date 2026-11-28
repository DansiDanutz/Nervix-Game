import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CONTACT_SHADOW, contactShadowPose } from "./contactShadowPose";

/**
 * Sun direction for figure shadows on the baked arrival square; null everywhere else (interiors
 * and the salon receive real shadow maps). Provided inside the Canvas by SceneView.
 */
export const ContactShadowSun = createContext<readonly [number, number, number] | null>(null);

const TEXTURE_SIZE = 64;
let shared: THREE.Texture | null = null;

/** One soft elliptical falloff texture for every decal (never disposed: it is tiny and reused). */
function falloff(): THREE.Texture {
  if (shared) return shared;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const r = TEXTURE_SIZE / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  }
  shared = new THREE.CanvasTexture(canvas);
  return shared;
}

const GROUND_LIFT = 0.02;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * A soft lavender cast shadow under a figure of `height` metres; renders nothing without a sun.
 * Mount it inside the figure's group: it follows the figure's feet but keeps a world-space
 * orientation and size (the figure may turn and be scaled).
 */
export function ContactShadow({ height }: { height: number }) {
  const sun = useContext(ContactShadowSun);
  const ref = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), want: new THREE.Quaternion(), flat: new THREE.Quaternion() }), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        name: "contact_shadow",
        color: CONTACT_SHADOW.color,
        alphaMap: falloff(),
        transparent: true,
        opacity: CONTACT_SHADOW.opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const pose = sun ? contactShadowPose(sun, height) : null;

  useFrame(() => {
    const mesh = ref.current;
    const parent = mesh?.parent;
    if (!mesh || !parent || !pose) return;
    const { p, q, s, want, flat } = tmp;
    parent.updateWorldMatrix(true, false);
    parent.matrixWorld.decompose(p, q, s);
    // Lying flat on the ground (plane +y -> world -z), turned so its length runs along the shadow.
    want.setFromAxisAngle(Y_AXIS, pose.yaw).multiply(flat.setFromAxisAngle(X_AXIS, -Math.PI / 2));
    mesh.quaternion.copy(q).invert().multiply(want);
    mesh.position.set(p.x + pose.offsetX, p.y + GROUND_LIFT, p.z + pose.offsetZ);
    parent.worldToLocal(mesh.position);
    const k = s.x > 0 ? 1 / s.x : 1;
    mesh.scale.set(pose.width * k, pose.length * k, k);
  });

  if (!pose) return null;
  return (
    <mesh ref={ref} name="contact_shadow" material={material} raycast={() => null} renderOrder={1} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
