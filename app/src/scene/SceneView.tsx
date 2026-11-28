import { Suspense, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AgXToneMapping } from "three";
import { CityScene, type Marker, type SceneMode } from "./CityScene";
import { PlayerController } from "../player/PlayerController";
import { RemotePlayers } from "./RemotePlayers";
import { PerfMeter } from "./PerfMeter";
import { PlazaDressing } from "./PlazaDressing";
import { SetDressing } from "./SetDressing";
import { DevRaycast } from "./DevRaycast";
import { DevCamera } from "./devCamera";
import { HouseDoors, type HouseDoor } from "./HouseDoors";
import { InteriorRoom } from "./InteriorRoom";
import { FacadeModel, SalonScene } from "./OpenPokerScene";
import { ArrivalBoundary, ArrivalLighting, ArrivalProbe, ArrivalSquare } from "./ArrivalSquare";
import { ArrivalAmbientOcclusion } from "./ArrivalAmbientOcclusion";
import { danggDoor, testBuilderDoor, type Anchor, type Place, type PlazaLayout, type SliceLayout } from "./slice";
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
  /** The arrival GLB failed to load; the scene falls back to the legacy district. */
  onArrivalError?: (message: string) => void;
}

const ROOM_BOUNDS = { minX: -5.6, maxX: 5.6, minZ: -4.2, maxZ: 4.2 };
const LEGACY_PLAZA_BOUNDS = 38;
const LEGACY_FAR = 220;
/** The casino chunk is superseded by the Blender OpenPoker facade whenever the slice layout exists. */
const FACADE_REPLACES = ["nervix_casino"];
/** Blender renders the slice with the AgX view transform; matching it keeps saturated paints from going orange. */
const BLENDER_VIEW = { toneMapping: AgXToneMapping, toneMappingExposure: 1.15 } as const;
/**
 * The open-air arrival square needs a little more exposure than the salon: measured on the GPU spawn
 * frame against blender-arrival-street.png, sunlit facades, portico and fountain stone read 0.05-0.10 L
 * darker than Cycles at 1.15 (three.js has no multi-bounce light to lift them).
 */
const ARRIVAL_VIEW = { ...BLENDER_VIEW, toneMappingExposure: 1.27 } as const;

/** Legacy plaza lighting, used only until the Blender arrival square is exported. */
function LegacyPlazaLighting() {
  return (
    <>
      <color attach="background" args={["#cfe3ec"]} />
      <fog attach="fog" args={["#dfe6ea", 70, 160]} />
      <hemisphereLight intensity={0.75} color="#ffe9c9" groundColor="#b98f63" />
      <directionalLight position={[-16, 9, 10]} intensity={2.6} color="#ffd2a1" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    </>
  );
}

function PlazaWorld({ props, plaza, onArrivalFailed }: { props: SceneProps; plaza: PlazaLayout | null; onArrivalFailed: (message: string) => void }) {
  const { layout } = props;
  // The arrival square supersedes these district chunks and both runtime dressings; never draw both.
  const hide = plaza ? [...plaza.replacesChunks, ...FACADE_REPLACES] : layout ? FACADE_REPLACES : [];
  return (
    <>
      {plaza ? <ArrivalLighting lighting={plaza.lighting} /> : <LegacyPlazaLighting />}
      {plaza && <ArrivalAmbientOcclusion />}
      <Suspense fallback={null}>
        <CityScene onMarkers={props.onMarkers} mode={props.mode} hide={hide} blockout={!plaza} />
      </Suspense>
      {plaza && (
        <ArrivalBoundary onError={onArrivalFailed}>
          <Suspense fallback={null}>
            <ArrivalSquare plaza={plaza} />
          </Suspense>
        </ArrivalBoundary>
      )}
      {layout && (
        <Suspense fallback={null}>
          <FacadeModel door={layout.facadeDoor} onClickDoor={props.onEnterVenue} />
        </Suspense>
      )}
      <HouseDoors doors={[testBuilderDoor(layout)]} onDoorClick={props.onEnterHouse} blockout={!plaza} />
      {!plaza && <PlazaDressing />}
      {/* Hand-made runtime dressing predates the Blender facade; never draw both. */}
      {!layout && <SetDressing />}
      <RemotePlayers players={props.players} selfId={props.selfId} />
      {import.meta.env.DEV && <ArrivalProbe fountain={plaza?.fountain ?? { x: 0, z: 0, radius: 2.4, topY: 1.2 }} />}
    </>
  );
}

/** The 3D view is loaded lazily so the interface paints before three.js. */
export default function SceneView(props: SceneProps) {
  const { place, layout, onArrivalError } = props;
  const [arrivalFailed, setArrivalFailed] = useState(false);
  const onArrivalFailed = useCallback(
    (message: string) => {
      setArrivalFailed(true);
      onArrivalError?.(message);
    },
    [onArrivalError],
  );
  const key = place.kind === "house" ? `house:${place.door.id}` : place.kind;
  const plaza = place.kind === "plaza";
  const venue = place.kind === "venue" && layout;
  const arrival = plaza && !arrivalFailed ? layout?.plaza ?? null : null;
  const plazaBounds = layout?.plaza?.bounds ?? LEGACY_PLAZA_BOUNDS;
  const bounds = place.kind === "house" ? ROOM_BOUNDS : venue ? layout.salon.bounds : plazaBounds;
  const obstacles = venue ? layout.salon.obstacles : plaza ? layout?.plaza?.obstacles ?? [] : [];
  const far = arrival ? Math.max(LEGACY_FAR, arrival.lighting.fog.far * 1.5) : LEGACY_FAR;

  return (
    <Canvas
      key={key}
      // PCF soft shadow maps (filtered edges) for every place.
      shadows="soft"
      dpr={[1, 1.5]}
      gl={arrival ? ARRIVAL_VIEW : venue ? BLENDER_VIEW : undefined}
      onCreated={({ gl }) => {
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervix = gl;
      }}
      camera={{ position: [props.spawn.x, 3, props.spawn.z + 4], fov: 55, near: 0.1, far }}>
      {!plaza && <color attach="background" args={["#2a1d1a"]} />}
      {!plaza && <hemisphereLight intensity={0.45} color="#ffe9c9" groundColor="#b98f63" />}
      {plaza && <PlazaWorld props={props} plaza={arrival} onArrivalFailed={onArrivalFailed} />}
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
      {/* DEV only, after the rig: ?cam=a01 pins the judged A01 pose (blender/scripts/arrival_camera.py). */}
      {import.meta.env.DEV && <DevCamera />}
      <PerfMeter onFps={props.onFps} />
      {import.meta.env.DEV && <DevRaycast />}
    </Canvas>
  );
}
