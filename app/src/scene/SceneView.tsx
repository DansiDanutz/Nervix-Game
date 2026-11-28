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
import { FacadeModel, SalonScene } from "./OpenPokerScene";
import { danggDoor, TEST_BUILDER_DOOR, type Anchor, type Place, type SliceLayout } from "./slice";
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
  teleportTo?: { x: number; z: number; key: number; yaw?: number } | null;
  onPosition?: (x: number, z: number) => void;
  place: Place;
  layout: SliceLayout | null;
  spawn: Anchor;
  onEnterHouse: (door: HouseDoor) => void;
  onEnterVenue: () => void;
}

const ROOM_BOUNDS = { minX: -5.6, maxX: 5.6, minZ: -4.2, maxZ: 4.2 };

/** The 3D view is loaded lazily so the interface paints before three.js. */
export default function SceneView(props: SceneProps) {
  const { place, layout } = props;
  const key = place.kind === "house" ? `house:${place.door.id}` : place.kind;
  const plaza = place.kind === "plaza";
  const venue = place.kind === "venue" && layout;
  const bounds = place.kind === "house" ? ROOM_BOUNDS : venue ? layout.salon.bounds : 38;
  const obstacles = venue ? layout.salon.obstacles : [];

  return (
    <Canvas
      key={key}
      shadows
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervix = gl;
      }}
      camera={{ position: [props.spawn.x, 3, props.spawn.z + 4], fov: 55, near: 0.1, far: 220 }}>
      <color attach="background" args={[plaza ? "#cfe3ec" : "#2a1d1a"]} />
      {plaza && <fog attach="fog" args={["#dfe6ea", 70, 160]} />}
      <hemisphereLight intensity={plaza ? 0.75 : 0.45} color="#ffe9c9" groundColor="#b98f63" />
      {plaza && (
        <directionalLight position={[-16, 9, 10]} intensity={2.6} color="#ffd2a1" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      )}
      {plaza && (
        <Suspense fallback={null}>
          <CityScene onMarkers={props.onMarkers} mode={props.mode} hide={layout ? ["nervix_casino"] : []} />
        </Suspense>
      )}
      {plaza && layout && (
        <Suspense fallback={null}>
          <FacadeModel door={layout.facadeDoor} onClickDoor={props.onEnterVenue} />
        </Suspense>
      )}
      {plaza && <HouseDoors doors={[TEST_BUILDER_DOOR]} onDoorClick={props.onEnterHouse} />}
      {plaza && <PlazaDressing />}
      {/* Hand-made runtime dressing predates the Blender facade; never draw both. */}
      {plaza && !layout && <SetDressing />}
      {venue && (
        <Suspense fallback={null}>
          <SalonScene exit={layout.salon.exit} danggDoor={layout.salon.danggDoor} />
          <HouseDoors doors={[danggDoor(layout)]} onDoorClick={props.onEnterHouse} />
        </Suspense>
      )}
      {place.kind === "house" && (
        <>
          <directionalLight position={[-6, 8, 4]} intensity={1.6} color="#ffd2a1" />
          <InteriorRoom door={place.door} />
        </>
      )}
      <PlayerController
        markers={props.markers}
        onNearby={props.onNearby}
        onMove={props.onMove}
        teleportTo={props.teleportTo}
        onPosition={props.onPosition}
        bounds={bounds}
        obstacles={obstacles}
        interior={!plaza}
        spawn={props.spawn}
      />
      {plaza && <RemotePlayers players={props.players} selfId={props.selfId} />}
      <PerfMeter onFps={props.onFps} />
      {import.meta.env.DEV && <DevRaycast />}
    </Canvas>
  );
}
