/**
 * DEV only: `?cam=a01` pins the camera to the judged A01 pose for the reference | Blender | game strip.
 *
 * The pose comes from /slice/a01-camera.json, written by blender/scripts/arrival_camera.py from
 * CAM_A01 (Blender (x, y, z) -> runtime (x, z, -y); fov is vertical, as in three.js). While active
 * the local avatar and the DOM overlays are hidden so the frame shows only the world. The component
 * is registered behind `import.meta.env.DEV`, so production builds never contain it.
 */
import { useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export const A01_POSE_URL = "/slice/a01-camera.json";
export const A01_QUERY = "a01";
const HIDE_STYLE_ID = "nervix-devcam-a01";
/** Everything in the app shell except the canvas host, plus world labels drawn as DOM. */
const HIDE_CSS = ".app > :not(:has(canvas)), .door-label { visibility: hidden !important; }";
const LOCAL_AVATAR = "player";

type Vec3 = [number, number, number];
export interface A01Pose {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fov: number;
  near: number;
  far: number;
}

export interface DevCameraState {
  ready: boolean;
  error: string | null;
  position: Vec3;
  direction: Vec3;
  fov: number;
  frames: number;
  avatarHidden: boolean;
}

function vec3(value: unknown, field: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    throw new Error(`a01-camera.json: ${field} must be three finite numbers`);
  }
  return [value[0], value[1], value[2]];
}

function positive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`a01-camera.json: ${field} must be a positive number`);
  }
  return value;
}

/** Validate the pose file; throws with a field-level message on bad data. */
export function parseA01Pose(raw: unknown): A01Pose {
  if (typeof raw !== "object" || raw === null) throw new Error("a01-camera.json: not an object");
  const r = raw as Record<string, unknown>;
  const pose: A01Pose = {
    position: vec3(r.position, "position"),
    target: vec3(r.target, "target"),
    up: r.up === undefined ? [0, 1, 0] : vec3(r.up, "up"),
    fov: positive(r.fov, "fov"),
    near: positive(r.near, "near"),
    far: positive(r.far, "far"),
  };
  if (pose.fov >= 180) throw new Error("a01-camera.json: fov must be below 180 degrees");
  if (pose.far <= pose.near) throw new Error("a01-camera.json: far must exceed near");
  const d = pose.target.map((t, i) => t - pose.position[i]);
  if (Math.hypot(d[0], d[1], d[2]) < 1e-6) throw new Error("a01-camera.json: target equals position");
  return pose;
}

/** Unit view direction of a pose. */
export function poseDirection(pose: A01Pose): Vec3 {
  const d = pose.target.map((t, i) => t - pose.position[i]);
  const len = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / len, d[1] / len, d[2] / len];
}

export function devCameraRequested(search: string): boolean {
  return new URLSearchParams(search).get("cam") === A01_QUERY;
}

const round = (v: THREE.Vector3): Vec3 => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];

function publish(state: DevCameraState) {
  (window as unknown as Record<string, unknown>).__nervixDevCamera = state;
}

function useHiddenOverlays(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = HIDE_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, [active]);
}

/** Mount inside the Canvas after PlayerController so this frame callback runs after the camera rig. */
export function DevCamera() {
  const active = devCameraRequested(window.location.search);
  const { camera, scene } = useThree();
  const [pose, setPose] = useState<A01Pose | null>(null);
  useHiddenOverlays(active);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    fetch(A01_POSE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`${A01_POSE_URL}: HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => alive && setPose(parseA01Pose(raw)))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[devCamera]", message);
        publish({ ready: false, error: message, position: [0, 0, 0], direction: [0, 0, -1], fov: 0, frames: 0, avatarHidden: false });
      });
    return () => {
      alive = false;
    };
  }, [active]);

  useFrame(() => {
    if (!active || !pose) return;
    const avatar = scene.getObjectByName(LOCAL_AVATAR);
    if (avatar) avatar.visible = false;
    camera.position.set(...pose.position);
    camera.up.set(...pose.up);
    camera.lookAt(...pose.target);
    if (camera instanceof THREE.PerspectiveCamera && (camera.fov !== pose.fov || camera.near !== pose.near || camera.far !== pose.far)) {
      camera.fov = pose.fov;
      camera.near = pose.near;
      camera.far = pose.far;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    const prev = (window as unknown as { __nervixDevCamera?: DevCameraState }).__nervixDevCamera;
    publish({
      ready: true,
      error: null,
      position: round(camera.getWorldPosition(new THREE.Vector3())),
      direction: round(camera.getWorldDirection(new THREE.Vector3())),
      fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 0,
      frames: (prev?.ready ? prev.frames : 0) + 1,
      avatarHidden: avatar ? !avatar.visible : false,
    });
  });

  return null;
}
