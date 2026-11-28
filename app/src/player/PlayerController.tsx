import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Marker } from "../scene/CityScene";
import { touch } from "../net/input";

const SPEED = 4.2;
const RUN_MULTIPLIER = 1.7;
const INTERACT_DISTANCE = 2.6;

export function PlayerController({
  markers,
  onNearby,
  onMove,
  teleportTo,
  bounds = 38,
  onPosition,
  interior = false,
}: {
  markers: Marker[];
  onNearby: (m: Marker | null) => void;
  onMove?: (x: number, z: number) => void;
  teleportTo?: { x: number; z: number; key: number } | null;
  bounds?: number;
  onPosition?: (x: number, z: number) => void;
  interior?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const lastSent = useRef(0);
  const moved = useRef(false);
  const appliedTeleport = useRef(0);
  const lastPos = useRef(0);

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

  useFrame((_, delta) => {
    if (teleportTo && teleportTo.key !== appliedTeleport.current && group.current) {
      appliedTeleport.current = teleportTo.key;
      group.current.position.set(teleportTo.x, 0, teleportTo.z);
      moved.current = false;
    }
    const g = group.current;
    if (!g) return;
    const k = keys.current;
    const forward = (k["w"] || k["arrowup"] || touch.forward ? 1 : 0) - (k["s"] || k["arrowdown"] || touch.back ? 1 : 0);
    const strafe = (k["d"] || k["arrowright"] || touch.right ? 1 : 0) - (k["a"] || k["arrowleft"] || touch.left ? 1 : 0);
    const speed = SPEED * (k["shift"] ? RUN_MULTIPLIER : 1) * Math.min(delta, 0.05);

    if (forward !== 0 || strafe !== 0) {
      moved.current = true;
      // Camera-relative, no yaw feedback: W moves away from the camera,
      // D moves to screen-right.
      let fx = g.position.x - camera.position.x;
      let fz = g.position.z - camera.position.z;
      const flen = Math.hypot(fx, fz) || 1;
    fx /= flen;
      fz /= flen;
      const dx = fx * forward + -fz * strafe;
      const dz = fz * forward + fx * strafe;
      const len = Math.hypot(dx, dz) || 1;
      g.position.x = THREE.MathUtils.clamp(g.position.x + (dx / len) * speed, -bounds, bounds);
      g.position.z = THREE.MathUtils.clamp(g.position.z + (dz / len) * speed, -bounds, bounds);
      g.rotation.y = Math.atan2(dx, dz);
      const now = performance.now();
      if (onMove && now - lastSent.current > 150) {
        lastSent.current = now;
        onMove(g.position.x, g.position.z);
      }
    }

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__nervixPlayer = {
        x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2),
        cx: +camera.position.x.toFixed(2), cz: +camera.position.z.toFixed(2),
      };
    }
    const nowPos = performance.now();
    if (onPosition && nowPos - lastPos.current > 200) {
      lastPos.current = nowPos;
      onPosition(g.position.x, g.position.z);
    }

    if (interior) {
      // Eye-level interior camera, behind the avatar, after movement.
      const back = 4.2;
      const target = new THREE.Vector3(g.position.x, 1.65, g.position.z + back);
      camera.position.lerp(target, 1 - Math.pow(0.0001, delta));
      camera.lookAt(g.position.x, 1.3, g.position.z - 1.2);
      return;
    }
    const dist = interior ? 4.4 : 9;
    const height = interior ? 2.7 : 5.2;
    const target = new THREE.Vector3(g.position.x, g.position.y + height, g.position.z + dist);
    // Establishing shot holds a fixed offset until the player moves.
    camera.position.lerp(target, 1 - Math.pow(moved.current ? 0.001 : 0.02, delta));
    if (moved.current) {
      camera.lookAt(g.position.x, g.position.y + 1.2, g.position.z);
    } else {
      camera.lookAt(0, 1.0, 0);
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
    <group ref={group} name="player" position={[3.2, 0, 7.5]}>
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