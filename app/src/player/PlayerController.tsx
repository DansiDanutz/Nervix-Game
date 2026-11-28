import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Marker } from "../scene/CityScene";
import { touch } from "../net/input";
import { applyLook, cameraOffset, moveVector, resolveMove, type Box, type Look } from "./cameraRig";

const SPEED = 4.2;
const RUN_MULTIPLIER = 1.7;
const INTERACT_DISTANCE = 2.6;
const PLAYER_RADIUS = 0.35;
const LOOK_SENSITIVITY = 0.005;
const KEY_TURN_RATE = 1.8; // rad/s for Q / E-less keyboard turning
const DRAG_THRESHOLD_PX = 4;

// Pedestrian eye level: camera ~1.75 m, just behind the shoulder, looking level
// along the street. Never overhead, never pitched up at the sky.
const VIEW = {
  exterior: { distance: 3.0, pitch: 0.05, eye: 1.62, shoulder: 0.6 },
  interior: { distance: 2.6, pitch: 0.05, eye: 1.6, shoulder: 0.5 },
} as const;

export interface PlayerControllerProps {
  markers: Marker[];
  onNearby: (m: Marker | null) => void;
  onMove?: (x: number, z: number) => void;
  teleportTo?: { x: number; z: number; key: number; yaw?: number } | null;
  bounds?: number | Box;
  obstacles?: Box[];
  onPosition?: (x: number, z: number) => void;
  interior?: boolean;
  spawn?: { x: number; z: number; yaw?: number };
}

/** Third-person player: WASD/arrows move, drag with the mouse to look, Shift runs, Q/R turn. */
export function PlayerController({
  markers,
  onNearby,
  onMove,
  teleportTo,
  bounds = 38,
  obstacles = [],
  onPosition,
  interior = false,
  spawn = { x: 3.2, z: 7.5 },
}: PlayerControllerProps) {
  const group = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const look = useRef<Look>({ yaw: spawn.yaw ?? 0, pitch: interior ? VIEW.interior.pitch : VIEW.exterior.pitch });
  // Exposed for tests: the arrival view must be pedestrian height and level.
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervixView = { exterior: VIEW.exterior, interior: VIEW.interior };
  const { camera, gl } = useThree();
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const lastSent = useRef(0);
  const appliedTeleport = useRef(0);
  const lastPos = useRef(0);
  const snapped = useRef(false);

  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    const reset = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);

  // Mouse look: drag on the canvas. A press without movement stays a click,
  // so objects keep receiving onClick for interaction.
  useEffect(() => {
    const el = gl.domElement;
    let start: { x: number; y: number } | null = null;
    let last: { x: number; y: number } | null = null;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      start = last = { x: e.clientX, y: e.clientY };
      dragging = false;
    };
    const onMovePtr = (e: PointerEvent) => {
      if (!start || !last || e.buttons === 0) return;
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      look.current = applyLook(look.current, e.clientX - last.x, e.clientY - last.y, LOOK_SENSITIVITY);
      last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      start = last = null;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const delta = Math.min(rawDelta, 0.05);
    if (teleportTo && teleportTo.key !== appliedTeleport.current) {
      appliedTeleport.current = teleportTo.key;
      g.position.set(teleportTo.x, 0, teleportTo.z);
      if (teleportTo.yaw !== undefined) look.current = { ...look.current, yaw: teleportTo.yaw };
    }
    const k = keys.current;
    if (k["q"]) look.current = { ...look.current, yaw: look.current.yaw + KEY_TURN_RATE * delta };
    if (k["r"]) look.current = { ...look.current, yaw: look.current.yaw - KEY_TURN_RATE * delta };
    const forward = (k["w"] || k["arrowup"] || touch.forward ? 1 : 0) - (k["s"] || k["arrowdown"] || touch.back ? 1 : 0);
    const strafe = (k["d"] || k["arrowright"] || touch.right ? 1 : 0) - (k["a"] || k["arrowleft"] || touch.left ? 1 : 0);
    const dir = moveVector(forward, strafe, look.current.yaw);

    if (dir.x !== 0 || dir.z !== 0) {
      const step = SPEED * (k["shift"] ? RUN_MULTIPLIER : 1) * delta;
      const from = { x: g.position.x, z: g.position.z };
      const next = resolveMove(from, { x: from.x + dir.x * step, z: from.z + dir.z * step }, obstacles, PLAYER_RADIUS, bounds);
      g.position.x = next.x;
      g.position.z = next.z;
      g.rotation.y = Math.atan2(dir.x, dir.z);
      const now = performance.now();
      if (onMove && now - lastSent.current > 150) {
        lastSent.current = now;
        onMove(g.position.x, g.position.z);
      }
    }

    const view = interior ? VIEW.interior : VIEW.exterior;
    const offset = cameraOffset(look.current.yaw, look.current.pitch, view.distance);
    // Over the right shoulder so the avatar never covers the centre of the view.
    const right = moveVector(0, 1, look.current.yaw);
    const target = new THREE.Vector3(
      g.position.x + offset.x + right.x * view.shoulder,
      view.eye + offset.y,
      g.position.z + offset.z + right.z * view.shoulder,
    );
    // The first frame is already the settled arrival view: no swoop from a default camera.
    if (!snapped.current) {
      camera.position.copy(target);
      snapped.current = true;
    } else {
      camera.position.lerp(target, 1 - Math.pow(0.0005, delta));
    }
    // Look past the player's shoulder toward where they face, at eye height.
    const ahead = cameraOffset(look.current.yaw, 0, -6);
    camera.lookAt(g.position.x + ahead.x + right.x * view.shoulder, view.eye - 0.1, g.position.z + ahead.z + right.z * view.shoulder);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__nervixPlayer = {
        x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2), yaw: +look.current.yaw.toFixed(3),
        cx: +camera.position.x.toFixed(2), cy: +camera.position.y.toFixed(2), cz: +camera.position.z.toFixed(2),
        lookY: +camera.getWorldDirection(new THREE.Vector3()).y.toFixed(3),
      };
    }
    const nowPos = performance.now();
    if (onPosition && nowPos - lastPos.current > 120) {
      lastPos.current = nowPos;
      onPosition(g.position.x, g.position.z);
    }

    let best: Marker | null = null;
    let bestDist = INTERACT_DISTANCE;
    for (const m of markers) {
      const d = Math.hypot(m.position[0] - g.position.x, m.position[2] - g.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    if ((best?.id ?? null) !== nearbyId) {
      setNearbyId(best?.id ?? null);
      onNearby(best);
    }
  });

  return (
    <group ref={group} name="player" position={[spawn.x, 0, spawn.z]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 0.9, 6, 12]} />
        <meshStandardMaterial color="#3f6f8f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#e7b98f" roughness={0.6} />
      </mesh>
      {[-0.09, 0.09].map((x) => (
        <mesh key={x} position={[x, 1.66, 0.22]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#2b2118" />
        </mesh>
      ))}
    </group>
  );
}
