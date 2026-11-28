/**
 * Remote crowd (C6): other players in the current place, interpolated between presence ticks and
 * drawn at three levels of detail (world/remoteCrowd.ts). Replaces scene/RemotePlayers.tsx.
 *
 * Draw calls do not grow with the room: 6 part meshes for near full detail (shadow casters),
 * 6 for mid full detail, 1 impostor mesh, plus at most CROWD_LIMITS.labelCap label sprites, and on
 * the baked arrival square one contact-shadow decal per full-detail figure (RemoteCrowdShadows.tsx).
 * Positions update in the render loop; React re-renders only when the presence list changes.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { RemotePlayer } from "../net/presenceCore";
import { CROWD_LIMITS, crowdStats, emptyCrowd, ingestPlayers, planCrowd, type Crowd, type CrowdPlan } from "../world/remoteCrowd";
import {
  CROWD_CAPACITY, createCrowdParts, createImpostor, createPresetColours, noRaycast, prepareInstanced, writeCrowd,
  type CrowdPart,
} from "./RemoteCrowdParts";
import { CrowdLabels } from "./RemoteCrowdLabels";
import { CrowdContactShadows, placeContactShadows, type ShadowSlots } from "./RemoteCrowdShadows";

/** DEV hook refresh interval for E2E (ms). */
const DEBUG_EVERY_MS = 500;

/** DEV-only test hook (E2E crowd.spec.ts): tier counts and the renderer's draw calls. */
function publishDebug(plan: CrowdPlan, gl: THREE.WebGLRenderer): void {
  if (!import.meta.env?.DEV) return;
  const stats = crowdStats(plan);
  (window as unknown as Record<string, unknown>).__nervixCrowd = Object.freeze({ ...stats, calls: gl.info.render.calls, triangles: gl.info.render.triangles });
}

function PartSet({ parts, shadow, meshes }: { parts: readonly CrowdPart[]; shadow: boolean; meshes: (THREE.InstancedMesh | null)[] }) {
  return (
    <>
      {parts.map((part, i) => {
        const capacity = CROWD_LIMITS.fullCap * part.locals.length;
        return (
          <instancedMesh
            key={part.key}
            name={`crowd_${shadow ? "near" : "mid"}_${part.key}`}
            args={[part.geometry, part.material, capacity]}
            castShadow={shadow}
            frustumCulled={false}
            raycast={noRaycast}
            ref={(mesh: THREE.InstancedMesh | null) => {
              prepareInstanced(mesh, capacity);
              meshes[i] = mesh;
            }}
          />
        );
      })}
    </>
  );
}

/** Other players. Presence already excludes this player and anyone outside the current place. */
export function RemoteCrowd({ players }: { players: readonly RemotePlayer[] }) {
  const gl = useThree((s) => s.gl);
  const parts = useMemo(createCrowdParts, []);
  const impostor = useMemo(createImpostor, []);
  const colours = useMemo(createPresetColours, []);
  const crowd = useRef<Crowd>(emptyCrowd());
  const plan = useRef<CrowdPlan>([]);
  const near = useRef<(THREE.InstancedMesh | null)[]>([]);
  const mid = useRef<(THREE.InstancedMesh | null)[]>([]);
  const far = useRef<THREE.InstancedMesh | null>(null);
  const labelGroup = useRef<THREE.Group | null>(null);
  const shadowSlots = useRef<ShadowSlots>([]);
  const labels = useRef<CrowdLabels | null>(null);
  const lastDebug = useRef(0);

  useEffect(() => {
    crowd.current = ingestPlayers(crowd.current, players, performance.now());
  }, [players]);

  useEffect(() => {
    const group = labelGroup.current;
    if (!group) return undefined;
    const pool = new CrowdLabels(group);
    labels.current = pool;
    return () => {
      pool.dispose();
      labels.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      for (const part of parts) {
        part.geometry.dispose();
        part.material.dispose();
      }
      impostor.geometry.dispose();
      impostor.material.dispose();
    },
    [parts, impostor],
  );

  useFrame(({ camera }) => {
    const now = performance.now();
    const next = planCrowd(crowd.current, now, { x: camera.position.x, z: camera.position.z }, plan.current);
    plan.current = next;
    writeCrowd(next, parts, { near: near.current, mid: mid.current, impostor: far.current }, colours);
    placeContactShadows(shadowSlots.current, next);
    labels.current?.update(next);
    if (now - lastDebug.current >= DEBUG_EVERY_MS) {
      lastDebug.current = now;
      publishDebug(next, gl);
    }
  });

  return (
    <group name="remote_crowd">
      <PartSet parts={parts} shadow meshes={near.current} />
      <PartSet parts={parts} shadow={false} meshes={mid.current} />
      <instancedMesh
        name="crowd_impostor"
        args={[impostor.geometry, impostor.material, CROWD_CAPACITY]}
        frustumCulled={false}
        raycast={noRaycast}
        ref={(mesh: THREE.InstancedMesh | null) => {
          prepareInstanced(mesh, CROWD_CAPACITY);
          far.current = mesh;
        }}
      />
      <group ref={labelGroup} name="crowd_labels" />
      <CrowdContactShadows slots={shadowSlots.current} />
    </group>
  );
}
