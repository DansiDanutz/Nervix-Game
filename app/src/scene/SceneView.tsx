import { Suspense, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, AgXToneMapping, CustomToneMapping, NeutralToneMapping, SRGBColorSpace, type ToneMapping } from "three";
import { CityScene, type Marker, type SceneMode } from "./CityScene";
import { PlayerController } from "../player/PlayerController";
import { roomWalls } from "../player/cameraRig";
import { plazaCameraBlockers } from "../player/cameraBlockers";
import { useMyPreset } from "../player/useMyPreset";
import { RemoteCrowd } from "../world3d/RemoteCrowd";
import { ChatBubbles } from "../world3d/ChatBubbles";
import { MerchantHouses } from "../world3d/MerchantHouse";
import { MerchantNpcs } from "../world3d/MerchantNpcs";
import { directoryHouse, type WorldDirectory } from "../world/useWorldDirectory";
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
import { Pedestrians } from "./Pedestrians";
import { ContactShadowSun } from "./ContactShadow";
import { arrivalRig } from "./arrivalLighting";
import { sunDirection } from "./fountainWater";
import type { Anchor, Place, PlazaLayout, PlazaLighting, SliceLayout } from "./slice";
import { arrivalView, type ToneMappingName } from "./postFx";
import { installAgxPunchy } from "./agxToneMapping";
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
  /** World house directory joined with this layout's doors and plots (useWorldDirectory). */
  directory: WorldDirectory;
  /** The arrival GLB failed to load; the scene falls back to the legacy district. */
  onArrivalError?: (message: string) => void;
}

const ROOM_BOUNDS = { minX: -5.6, maxX: 5.6, minZ: -4.2, maxZ: 4.2 };
/** The house room's walls stop the camera boom (CT5 pull-in); the plaza and salon use their collision boxes. */
const ROOM_WALLS = roomWalls(ROOM_BOUNDS);
const LEGACY_PLAZA_BOUNDS = 38;
const LEGACY_FAR = 220;
/** The casino chunk is superseded by the Blender OpenPoker facade whenever the slice layout exists. */
const FACADE_REPLACES = ["nervix_casino"];
/** Blender renders the slice with the AgX view transform; matching it keeps saturated paints from going orange. */
const BLENDER_VIEW = { toneMapping: AgXToneMapping, toneMappingExposure: 1.15 } as const;
/** three constants for the manifest/postFx view names. */
const TONE_MAPPING: Record<ToneMappingName, ToneMapping> = { aces: ACESFilmicToneMapping, agx: AgXToneMapping, neutral: NeutralToneMapping };

/**
 * Arrival view transform: ACES filmic with sRGB output by default (postFx.ts); the manifest's
 * lighting.view overrides it to match the view the Blender bake was graded under. AgX with the
 * Punchy look (Blender's render setting) runs as three's CustomToneMapping (agxToneMapping.ts).
 */
function arrivalGl(lighting: PlazaLighting) {
  const view = arrivalView(lighting.view);
  const punchy = view.look === "punchy" && installAgxPunchy();
  const toneMapping = punchy ? CustomToneMapping : TONE_MAPPING[view.toneMapping];
  return { toneMapping, toneMappingExposure: view.exposure, outputColorSpace: SRGBColorSpace } as const;
}

/**
 * Re-asserts the arrival view on the live renderer before any effect (the AO composer reads it), so
 * the Blender view holds whatever order R3F applies its own tone-mapping default and the gl props.
 * DEV: window.__nervixView reports what is actually in use, for the capture step.
 */
function ArrivalView({ view }: { view: ReturnType<typeof arrivalGl> }) {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.toneMapping = view.toneMapping;
    gl.toneMappingExposure = view.toneMappingExposure;
    gl.outputColorSpace = view.outputColorSpace;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__nervixView = { toneMapping: gl.toneMapping, exposure: gl.toneMappingExposure, custom: gl.toneMapping === CustomToneMapping };
    }
  }, [gl, view]);
  return null;
}

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

/**
 * Runtime K2 houses and their AI representatives on street plots (B4, C8). Plots Blender already
 * built are skipped, and so are plots on the spawn-to-fountain sightline (useWorldDirectory).
 * The B2 plots all sit on facades Blender modelled, so today this draws no K2 house and places no
 * NPC; a plot exported with built: false gets both. The NPC list still reaches its DEV hook.
 */
function StreetHouses({ directory }: { directory: WorldDirectory }) {
  if (!directory.houses) return null;
  return (
    <>
      <MerchantHouses houses={directory.houses} plots={directory.streetPlots} builtPlotIds={directory.builtPlotIds} />
      <MerchantNpcs houses={directory.houses} plots={directory.streetPlots.filter((p) => !directory.builtPlotIds.has(p.id))} />
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
      {plaza && <ArrivalAmbientOcclusion lighting={plaza.lighting} />}
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
      {plaza && <Pedestrians plaza={plaza} />}
      {layout && (
        <Suspense fallback={null}>
          <FacadeModel door={layout.facadeDoor} onClickDoor={props.onEnterVenue} />
        </Suspense>
      )}
      <HouseDoors doors={[...props.directory.plazaDoors]} onDoorClick={props.onEnterHouse} blockout={!plaza} />
      <StreetHouses directory={props.directory} />
      {!plaza && <PlazaDressing />}
      {/* Hand-made runtime dressing predates the Blender facade; never draw both. */}
      {!layout && <SetDressing />}
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
  // CT5: low plaza boxes (fountain basin, posts, benches) never pull the boom in; only walls do.
  const plazaLayout = plaza ? layout?.plaza ?? null : null;
  const cameraBlockers = useMemo(
    () => (place.kind === "house" ? ROOM_WALLS : plazaLayout ? plazaCameraBlockers(plazaLayout.obstacles, plazaLayout.fountain) : obstacles),
    [place.kind, plazaLayout, obstacles],
  );
  const arrivalLighting = arrival?.lighting;
  const glView = useMemo(() => (arrivalLighting ? arrivalGl(arrivalLighting) : venue ? BLENDER_VIEW : undefined), [arrivalLighting, venue]);
  const far = arrival ? Math.max(LEGACY_FAR, arrival.lighting.fog.far * 1.5) : LEGACY_FAR;
  // Figures on the baked square lay their own cast shadows (ContactShadow); other places use shadow maps.
  const shadowSun = useMemo(() => (arrivalLighting ? sunDirection(arrivalRig(arrivalLighting).sun.position) : null), [arrivalLighting]);
  const preset = useMyPreset(props.selfId);

  return (
    <Canvas
      key={key}
      // CT4: a touch drag on the world looks around; the browser never scrolls or zooms the page.
      style={{ touchAction: "none" }}
      // PCF soft shadow maps (filtered edges) for every place.
      shadows="soft"
      dpr={[1, 1.5]}
      gl={glView}
      onCreated={({ gl }) => {
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervix = gl;
      }}
      camera={{ position: [props.spawn.x, 3, props.spawn.z + 4], fov: 55, near: 0.1, far }}>
      <ContactShadowSun.Provider value={shadowSun}>
      {!plaza && <color attach="background" args={["#2a1d1a"]} />}
      {!plaza && <hemisphereLight intensity={0.45} color="#ffe9c9" groundColor="#b98f63" />}
      {arrivalLighting && glView && <ArrivalView view={glView as ReturnType<typeof arrivalGl>} />}
      {plaza && <PlazaWorld props={props} plaza={arrival} onArrivalFailed={onArrivalFailed} />}
      {venue && (
        <Suspense fallback={null}>
          <SalonScene exit={layout.salon.exit} danggDoor={layout.salon.danggDoor} houseLabel={props.directory.salonDoors[0]?.label ?? null} />
          <HouseDoors doors={[...props.directory.salonDoors]} onDoorClick={props.onEnterHouse} />
        </Suspense>
      )}
      {place.kind === "house" && (
        <>
          <directionalLight position={[-6, 8, 4]} intensity={1.6} color="#ffd2a1" />
          <InteriorRoom door={place.door} house={directoryHouse(props.directory, place.door.propertyId)} />
        </>
      )}
      {/* Presence is place-scoped: these are the other players (and their chat) in this place only. */}
      <RemoteCrowd players={props.players} />
      <ChatBubbles players={props.players} />
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
        preset={preset}
        cameraBlockers={cameraBlockers}
      />
      {/* DEV only, after the rig: ?cam=a01 pins the judged A01 pose (blender/scripts/arrival_camera.py). */}
      {import.meta.env.DEV && <DevCamera />}
      <PerfMeter onFps={props.onFps} />
      {import.meta.env.DEV && <DevRaycast />}
      </ContactShadowSun.Provider>
    </Canvas>
  );
}
