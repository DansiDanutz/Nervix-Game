import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { CityScene, type Marker, type SceneMode } from "./CityScene";
import { PlayerController } from "../player/PlayerController";
import { RemotePlayers } from "./RemotePlayers";
import { PerfMeter } from "./PerfMeter";
import { PlazaDressing } from "./PlazaDressing";
import { SetDressing } from "./SetDressing";
import { DevRaycast } from "./DevRaycast";
import { HouseDoors, type HouseDoor } from "./HouseDoors";
import { InteriorRoom } from "./InteriorRoom";
import type { RemotePlayer } from "../net/presence";

export interface SceneProps {
  markers: Marker[];
  onMarkers: (m: Marker[]) => void;
  onNearby: (m: Marker | null) => void;
  onMove: (x: number, z: number) => void;
  onFps: (fps: number) => void;
  players: RemotePlayer[];
  selfId: string;
  mode?: SceneMode;
  teleportTo?: { x: number; z: number; key: number } | null;
  onNearDoor?: (d: HouseDoor | null) => void;
  onPosition?: (x: number, z: number) => void;
  interior?: HouseDoor | null;
  onExitInterior?: () => void;
}

/** The 3D view is loaded lazily so the interface paints before three.js. */
export default function SceneView(props: SceneProps) {
  return (
    <Canvas
      key={props.interior?.id ?? "plaza"}
      shadows
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervix = gl;
      }}
      camera={props.interior ? { position: [0, 7, 3.4], fov: 55, near: 0.1, far: 220 } : { position: [4, 8, 14], fov: 55, near: 0.1, far: 220 }}>
      <color attach="background" args={["#cfe3ec"]} />
      <fog attach="fog" args={["#dfe6ea", 70, 160]} />
      <hemisphereLight intensity={0.75} color="#ffe9c9" groundColor="#b98f63" />
      <directionalLight
        position={[-16, 9, 10]}
        intensity={2.6}
        color="#ffd2a1"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {!props.interior && (
        <Suspense fallback={null}>
          <CityScene onMarkers={props.onMarkers} mode={props.mode} />
        </Suspense>
      )}
      {!props.interior && <HouseDoors onNear={props.onNearDoor ?? (() => {})} />}
      {props.interior && <InteriorRoom door={props.interior} />}
      {!props.interior && <PlazaDressing />}
      {!props.interior && <SetDressing />}
      <PlayerController markers={props.markers} onNearby={props.onNearby} onMove={props.onMove} teleportTo={props.teleportTo} onPosition={props.onPosition} bounds={props.interior ? 5.2 : 38} interior={!!props.interior} />
      {!props.interior && <RemotePlayers players={props.players} selfId={props.selfId} />}
      <PerfMeter onFps={props.onFps} />
      {import.meta.env.DEV && <DevRaycast />}
    </Canvas>
  );
}