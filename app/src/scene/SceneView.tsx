import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { CityScene, type Marker, type SceneMode } from "./CityScene";
import { PlayerController } from "../player/PlayerController";
import { RemotePlayers } from "./RemotePlayers";
import { PerfMeter } from "./PerfMeter";
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
}

/** The 3D view is loaded lazily so the interface paints before three.js. */
export default function SceneView(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervix = gl;
      }}
      camera={{ position: [0, 4, 12], fov: 55, near: 0.1, far: 200 }}>
      <color attach="background" args={["#bfe0ea"]} />
      <fog attach="fog" args={["#bfe0ea", 30, 90]} />
      <hemisphereLight intensity={0.55} groundColor="#c9b18a" />
      <directionalLight
        position={[12, 18, 8]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Suspense fallback={null}>
        <CityScene onMarkers={props.onMarkers} mode={props.mode} />
      </Suspense>
      <PlayerController markers={props.markers} onNearby={props.onNearby} onMove={props.onMove} />
      <RemotePlayers players={props.players} selfId={props.selfId} />
      <PerfMeter onFps={props.onFps} />
    </Canvas>
  );
}