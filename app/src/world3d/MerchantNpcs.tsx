/**
 * C8 merchant NPCs: one AI representative per house in the B3 world directory,
 * standing at its K2 station (behind the counter) and facing out of the facade.
 * The K1 skinned pedestrian is used, standing idle, with a canvas label: the
 * merchant name from the API and "AI representative". An unverified or
 * suspended merchant is not in the directory, so it has no NPC.
 *
 * - <MerchantNpcs houses plots>: street houses, placed with the same B4 pose as
 *   <MerchantHouses>, so the NPC is inside its own house.
 * - <InteriorMerchantNpc house station>: inside a house room, at the variant-local
 *   station (interiorTemplate(variant).npcStation).
 *
 * In DEV, <MerchantNpcs> publishes window.__nervixNpcs (labels and placement only).
 * NOT MOUNTED: the lead applies the scene hookup in the scene wave.
 */
import { useEffect, useMemo } from "react";
import type { WorldHouse } from "../net/api/world";
import { AVATAR_PRESETS } from "../net/api/avatar";
import type { SlicePlot } from "../world/houseDirectory";
import { placeHouse, selectVariant, type K2Kit } from "../world/interiorTemplate";
import {
  merchantNpcs, npcDebugView, placeStreetNpcs, stationPose,
  type MerchantNpc, type NpcPose, type PlacedNpc, type StationFrame, type Vec3,
} from "../world/merchantNpcs";
import { useK2Kit } from "./MerchantHouse";
import { SkinnedAvatar, type LocomotionSource } from "./SkinnedAvatar";
import { MerchantNpcLabel } from "./MerchantNpcsLabel";
import { ContactShadow } from "../scene/ContactShadow";
import { AVATAR_HEIGHT } from "../player/avatarShape";

const PRESET_IDS = Object.freeze(AVATAR_PRESETS.map((p) => p.id));
/** Fallback figure while the K1 kit loads or if it fails (m). */
const FALLBACK = Object.freeze({ radius: 0.24, length: 1.1, y: 0.8 });

/** A source that never moves: the locomotion state machine keeps the NPC idle. */
const STILL: LocomotionSource = Object.freeze({ current: Object.freeze({ x: 0, z: 0, tMs: 0 }) });

function frameFor(kit: K2Kit) {
  return (npc: MerchantNpc, plot: SlicePlot): StationFrame => {
    const variant = selectVariant(kit, npc.propertyId, plot.sizeClass);
    const pose = placeHouse(plot, variant);
    return { position: pose.position, yaw: pose.yaw, station: variant.station };
  };
}

function publishDebug(npcs: readonly MerchantNpc[], placed: readonly PlacedNpc[]) {
  if (!import.meta.env.DEV) return;
  (window as unknown as Record<string, unknown>).__nervixNpcs = npcDebugView(npcs, placed);
}

function NpcFigure({ npc, pose }: { readonly npc: MerchantNpc; readonly pose: NpcPose }) {
  const fallback = (
    <mesh position={[0, FALLBACK.y, 0]} raycast={() => null}>
      <capsuleGeometry args={[FALLBACK.radius, FALLBACK.length, 4, 8]} />
      <meshStandardMaterial color={npc.accent} roughness={0.8} />
    </mesh>
  );
  return (
    <group name={`merchant_npc_${npc.propertyId}`} position={pose.position as [number, number, number]} userData={{ role: npc.role }}>
      <SkinnedAvatar preset={npc.preset} source={STILL} initialHeading={pose.heading} fallback={fallback} />
      <MerchantNpcLabel npc={npc} />
      {/* On the baked square only (no sun elsewhere): the figure must not float. */}
      <ContactShadow height={AVATAR_HEIGHT} />
    </group>
  );
}

export interface MerchantNpcsProps {
  /** The parsed B3 directory (loadWorldHouses), the same list the doors use. */
  readonly houses: readonly WorldHouse[];
  /** runtime_layout.plots[] from the slice manifest. */
  readonly plots: readonly SlicePlot[];
}

export function MerchantNpcs({ houses, plots }: MerchantNpcsProps) {
  const kit = useK2Kit();
  const npcs = useMemo(() => merchantNpcs(houses, PRESET_IDS), [houses]);
  const placed = useMemo(() => (kit ? placeStreetNpcs(npcs, plots, frameFor(kit)) : Object.freeze([])), [kit, npcs, plots]);
  useEffect(() => publishDebug(npcs, placed), [npcs, placed]);
  return (
    <group name="merchant_npcs">
      {placed.map((p) => (
        <NpcFigure key={p.npc.propertyId} npc={p.npc} pose={p} />
      ))}
    </group>
  );
}

export interface InteriorMerchantNpcProps {
  /** The directory entry of the house the player is in; null or unverified draws nothing. */
  readonly house: WorldHouse | null;
  /** Variant-local station: interiorTemplate(variant).npcStation. */
  readonly station: { readonly position: Vec3; readonly facing: Vec3 };
}

export function InteriorMerchantNpc({ house, station }: InteriorMerchantNpcProps) {
  const npc = useMemo(() => (house ? merchantNpcs([house], PRESET_IDS).at(0) ?? null : null), [house]);
  const pose = useMemo(() => stationPose({ position: [0, 0, 0], yaw: 0, station }), [station]);
  return npc ? <NpcFigure npc={npc} pose={pose} /> : null;
}
