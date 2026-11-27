import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Marker } from "../scene/CityScene";

const SPEED = 4.2;
const RUN_MULTIPLIER = 1.7;
const INTERACT_DISTANCE = 2.6;
const BOUNDS = 38;

export function PlayerController({
  markers,
  onNearby,
  onMove,
}: {
  markers: Marker[];
  onNearby: (m: Marker | null) => void;
  onMove?: (x: number, z: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const k = keys.current;
    const forward = (k["w"] || k["arrowup"] ? 1 : 0) - (k["s"] || k["arrowdown"] ? 1 : 0);
    const strafe = (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0);
    const speed = SPEED * (k["shift"] ? RUN_MULTIPLIER : 1) * Math.min(delta, 0.05);

    if (forward !== 0 || strafe !== 0) {
      const yaw = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      const dx = Math.sin(yaw) * forward + Math.cos(yaw) * strafe;
      const dz = Math.cos(yaw) * forward - Math.sin(yaw) * strafe;
      const len = Math.hypot(dx, dz) || 1;
      g.position.x = THREE.MathUtils.clamp(g.position.x + (dx / len) * speed, -BOUNDS, BOUNDS);
      g.position.z = THREE.MathUtils.clamp(g.position.z + (dz / len) * speed, -BOUNDS, BOUNDS);
      g.rotation.y = Math.atan2(dx, dz);
      const now = performance.now();
      if (onMove && now - lastSent.current > 150) {
        lastSent.current = now;
        onMove(g.position.x, g.position.z);
      }
    }

    const target = new THREE.Vector3(
      g.position.x + Math.sin(g.rotation.y) * 6,
      g.position.y + 3.4,
      g.position.z + Math.cos(g.rotation.y) * 6,
    );
    camera.position.lerp(target, 1 - Math.pow(0.001, delta));
    camera.lookAt(g.position.x, g.position.y + 1.4, g.position.z);

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
    <group ref={group} position={[0, 0, 6]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 0.9, 6, 12]} />
        <meshStandardMaterial color="#3f6f8f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#e7b98f" roughness={0.6} />
      </mesh>
    </group>
  );
}