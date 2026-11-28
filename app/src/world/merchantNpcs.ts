/**
 * C8 merchant NPCs: one AI representative per house in the B3 world directory
 * (GET /world/houses), standing at its K2 station. The name comes from the API
 * (merchantName) and the affiliation from the API's verified flag; nothing is
 * baked into the client. An unverified or suspended merchant is not listed by
 * the API, and anything not `verified: true` is dropped here too (fail closed).
 * Pure: no React, no runtime imports, inputs never mutated.
 */
import type { WorldHouse } from "../net/api/world";
import type { SlicePlot } from "./houseDirectory";

export type Vec3 = readonly [number, number, number];

export const NPC_ROLE = "AI representative";
export const VERIFIED_AFFILIATION = "Verified merchant";

export interface MerchantNpc {
  readonly propertyId: string;
  readonly plotId: string;
  /** The merchant's name, exactly as the directory returned it. */
  readonly name: string;
  readonly role: typeof NPC_ROLE;
  readonly affiliation: typeof VERIFIED_AFFILIATION;
  readonly accent: string;
  /** Avatar preset id (shared/contracts/avatar-presets.json). */
  readonly preset: string;
}

/** A house root pose (B4 placeHouse) plus its variant-local K2 station anchor. */
export interface StationFrame {
  readonly position: Vec3;
  readonly yaw: number;
  readonly station: { readonly position: Vec3; readonly facing: Vec3 };
}

export interface NpcPose {
  readonly position: Vec3;
  /** three.js rotation.y that turns local +z to the station's facing. */
  readonly heading: number;
}

export interface PlacedNpc extends NpcPose {
  readonly npc: MerchantNpc;
}

export interface NpcDebugEntry {
  readonly propertyId: string;
  readonly name: string;
  readonly role: string;
  readonly affiliation: string;
  readonly placed: boolean;
}

/** Contract fallback when no preset list is supplied (the first id in avatar-presets.json). */
const FALLBACK_PRESET = "teal";

/** FNV-1a, 32 bit: a stable spread of property ids over the presets. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

const presetFor = (propertyId: string, presets: readonly string[]) =>
  presets.length ? presets[hash(propertyId) % presets.length] : FALLBACK_PRESET;

function toNpc(house: WorldHouse, presets: readonly string[]): MerchantNpc {
  return Object.freeze({
    propertyId: house.propertyId,
    plotId: house.plotId,
    name: house.merchantName,
    role: NPC_ROLE,
    affiliation: VERIFIED_AFFILIATION,
    accent: house.accent,
    preset: presetFor(house.propertyId, presets),
  });
}

/** One NPC per verified directory house, in directory order; the first entry wins on a duplicate property. */
export function merchantNpcs(houses: readonly WorldHouse[], presets: readonly string[]): readonly MerchantNpc[] {
  const verified = houses.filter((h) => (h as { verified: unknown }).verified === true);
  const unique = verified.filter((h, i) => verified.findIndex((o) => o.propertyId === h.propertyId) === i);
  return Object.freeze(unique.map((h) => toNpc(h, presets)));
}

/** The two label lines: the API name, then the role. */
export const npcLabelLines = (npc: MerchantNpc): readonly [string, string] => Object.freeze([npc.name, npc.role]) as readonly [string, string];

/** World pose of the station: root position + rotation.y(yaw) applied to the local anchor. */
export function stationPose(frame: StationFrame): NpcPose {
  const c = Math.cos(frame.yaw);
  const s = Math.sin(frame.yaw);
  const [lx, ly, lz] = frame.station.position;
  const [fx, , fz] = frame.station.facing;
  const position = Object.freeze([
    frame.position[0] + c * lx + s * lz,
    frame.position[1] + ly,
    frame.position[2] - s * lx + c * lz,
  ]) as Vec3;
  return Object.freeze({ position, heading: Math.atan2(c * fx + s * fz, -s * fx + c * fz) });
}

/**
 * NPCs whose house has a plot in this layout, at that house's station. `frameOf`
 * supplies the B4 house pose and K2 station (null drops that NPC only).
 */
export function placeStreetNpcs(
  npcs: readonly MerchantNpc[],
  plots: readonly SlicePlot[],
  frameOf: (npc: MerchantNpc, plot: SlicePlot) => StationFrame | null,
): readonly PlacedNpc[] {
  const byId = new Map(plots.map((p) => [p.id, p]));
  return Object.freeze(npcs.flatMap((npc) => {
    const plot = byId.get(npc.plotId);
    const frame = plot ? frameOf(npc, plot) : null;
    return frame ? [Object.freeze({ npc, ...stationPose(frame) })] : [];
  }));
}

/** What the DEV hook publishes: labels and placement only, no user or merchant ids. */
export function npcDebugView(npcs: readonly MerchantNpc[], placed: readonly PlacedNpc[]): readonly NpcDebugEntry[] {
  const onStreet = new Set(placed.map((p) => p.npc.propertyId));
  return Object.freeze(npcs.map((n) => Object.freeze({
    propertyId: n.propertyId, name: n.name, role: n.role, affiliation: n.affiliation, placed: onStreet.has(n.propertyId),
  })));
}
