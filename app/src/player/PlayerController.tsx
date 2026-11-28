import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Marker } from "../scene/CityScene";
import { touch } from "../net/input";
import { useDragLook } from "../input/useDragLook";
import { useHeldKeys } from "../input/useHeldKeys";
import { driveFrom, frameDelta, groundSpeed, turnYaw } from "../input/movement";
import { Avatar } from "./Avatar";
import { LOCAL_PALETTE } from "./avatarShape";
import { applyLook, moveVector, resolveMove, thirdPersonFrame, VIEW, type Box, type Look } from "./cameraRig";
import { playerState } from "./playerState";

const INTERACT_DISTANCE = 2.6;
const PLAYER_RADIUS = 0.35;
const LOOK_SENSITIVITY = 0.005;

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

/** Third-person player: WASD/arrows move, drag with the mouse to look, Shift runs, Q/R turn (docs/CONTROLS.md). */
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
  const look = useRef<Look>({ yaw: spawn.yaw ?? 0, pitch: interior ? VIEW.interior.pitch : VIEW.exterior.pitch });
  // Exposed for tests: the arrival view must be pedestrian height and level.
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervixView = { exterior: VIEW.exterior, interior: VIEW.interior };
  const { camera, gl } = useThree();
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const lastSent = useRef(0);
  const appliedTeleport = useRef(0);
  const lastPos = useRef(0);
  const snapped = useRef(false);
  const onNearbyRef = useRef(onNearby);
  onNearbyRef.current = onNearby;

  // A nearby prompt belongs to this place only: clear it when the place (canvas) goes away.
  useEffect(() => () => onNearbyRef.current(null), []);

  // Movement keys (one typing filter, cleared on blur, hidden tab and Meta) and drag-to-orbit.
  const keys = useHeldKeys();
  useDragLook(gl.domElement, (dx, dy) => {
    look.current = applyLook(look.current, dx, dy, LOOK_SENSITIVITY);
  });

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const delta = frameDelta(rawDelta);
    if (teleportTo && teleportTo.key !== appliedTeleport.current) {
      appliedTeleport.current = teleportTo.key;
      g.position.set(teleportTo.x, 0, teleportTo.z);
      if (teleportTo.yaw !== undefined) look.current = { ...look.current, yaw: teleportTo.yaw };
    }
    const drive = driveFrom(keys.current, touch);
    if (drive.turn !== 0) look.current = { ...look.current, yaw: turnYaw(look.current.yaw, drive.turn, delta) };
    const dir = moveVector(drive.forward, drive.strafe, look.current.yaw);

    if (dir.x !== 0 || dir.z !== 0) {
      const step = groundSpeed(drive.run) * delta;
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

    // Read-only player state for presence and the scene: the look yaw (forward = (-sin, -cos)).
    playerState.publish({ x: g.position.x, z: g.position.z, yaw: look.current.yaw, tMs: performance.now() });

    // Over the right shoulder so the avatar never covers the centre of the view.
    const frame = thirdPersonFrame({ x: g.position.x, z: g.position.z }, look.current, interior ? VIEW.interior : VIEW.exterior);
    const target = new THREE.Vector3(frame.camera.x, frame.camera.y, frame.camera.z);
    // The first frame is already the settled arrival view: no swoop from a default camera.
    if (!snapped.current) {
      camera.position.copy(target);
      snapped.current = true;
    } else {
      camera.position.lerp(target, 1 - Math.pow(0.0005, delta));
    }
    // Look past the player's shoulder toward where they face, at eye height.
    camera.lookAt(frame.target.x, frame.target.y, frame.target.z);

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
      <Avatar palette={LOCAL_PALETTE} />
    </group>
  );
}
