/**
 * Baked-lighting contract between the Blender exporter and the client.
 *
 * A mesh whose lighting is baked in Cycles reaches the client in one of two ways:
 * - KHR_materials_unlit: the base colour already holds albedo x lighting (incl. AO). three's
 *   GLTFLoader turns it into a MeshBasicMaterial, which is drawn as is (tone mapped and fogged,
 *   never lit again).
 * - A lightmap on TEXCOORD_1 with extras {"lightmap": true} on the material, mesh or node. The
 *   lightmap texture travels in a glTF slot sampled on texCoord 1 (occlusionTexture, or
 *   emissiveTexture), and the client moves it to `material.lightMap` on uv1.
 * Everything else ("lit") keeps the runtime light rig.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

export type BakeMode = "unlit" | "lightmap" | "lit";

export interface BakeProbe {
  /** The loader produced a MeshBasicMaterial (only KHR_materials_unlit does for glTF). */
  basic: boolean;
  /** extras.lightmap === true on the material, mesh or any ancestor node. */
  lightmapFlag: boolean;
  /** The geometry carries a second UV set (TEXCOORD_1 -> `uv1`). */
  hasUv1: boolean;
  /** A texture sampled on uv1 is present in one of LIGHTMAP_SLOTS. */
  hasLightmapTexture: boolean;
}

/** Material slots that may carry the lightmap, in priority order. */
export const LIGHTMAP_SLOTS = Object.freeze(["lightMap", "aoMap", "emissiveMap"] as const);
export type LightmapSlot = (typeof LIGHTMAP_SLOTS)[number];

/** Lightmap texCoord set required by the contract. */
export const LIGHTMAP_CHANNEL = 1;

/**
 * How a mesh is drawn. A lightmap flag without uv1 or without a uv1 texture cannot be honoured,
 * so the mesh stays lit (the exporter is then reported, never silently half-baked).
 */
export function bakeMode(p: BakeProbe): BakeMode {
  if (p.basic) return "unlit";
  if (p.lightmapFlag && p.hasUv1 && p.hasLightmapTexture) return "lightmap";
  return "lit";
}

/** True when a mesh asked for a lightmap but the export cannot satisfy it. */
export function brokenLightmap(p: BakeProbe): boolean {
  return !p.basic && p.lightmapFlag && !(p.hasUv1 && p.hasLightmapTexture);
}

/** extras.lightmap === true on any of the given userData objects. */
export function lightmapFlag(...userData: unknown[]): boolean {
  return userData.some((u) => typeof u === "object" && u !== null && (u as Record<string, unknown>).lightmap === true);
}

const DEFAULT_LIGHTMAP_INTENSITY = 1;
const MAX_LIGHTMAP_INTENSITY = 16;

/** extras.lightmap_intensity (first finite, non-negative one wins), else 1; clamped to a sane range. */
export function lightmapIntensity(...userData: unknown[]): number {
  for (const u of userData) {
    const v = typeof u === "object" && u !== null ? (u as Record<string, unknown>).lightmap_intensity : undefined;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.min(v, MAX_LIGHTMAP_INTENSITY);
  }
  return DEFAULT_LIGHTMAP_INTENSITY;
}

export type LightmapEncoding = "srgb" | "linear";

/** glTF colour space of each slot when the export does not declare an encoding. */
const SLOT_ENCODING: Readonly<Record<LightmapSlot, LightmapEncoding>> = Object.freeze({
  lightMap: "linear",
  aoMap: "linear",
  emissiveMap: "srgb",
});

/**
 * How the lightmap texel is decoded: extras.lightmap_encoding ("srgb" | "linear", first valid one
 * wins), else the slot's glTF colour space. A JPEG lightmap carried in occlusionTexture is sRGB,
 * and reading it as linear lifts every shadow (washes the bake out).
 */
export function lightmapEncoding(slot: LightmapSlot, ...userData: unknown[]): LightmapEncoding {
  for (const u of userData) {
    const v = typeof u === "object" && u !== null ? (u as Record<string, unknown>).lightmap_encoding : undefined;
    const e = typeof v === "string" ? v.toLowerCase() : "";
    if (e === "srgb" || e === "linear") return e;
  }
  return SLOT_ENCODING[slot];
}

/** The first slot whose texture is sampled on uv1, or null. */
export function pickLightmapSlot(slots: Partial<Record<LightmapSlot, { channel: number } | null | undefined>>): LightmapSlot | null {
  for (const name of LIGHTMAP_SLOTS) if (slots[name]?.channel === LIGHTMAP_CHANNEL) return name;
  return null;
}

/** Metallic lightmapped surfaces keep PBR (sky reflection and sun glints); the rest are drawn unlit. */
export const LIGHTMAP_METAL_THRESHOLD = 0.5;

/** Share of the scene whose lighting is baked; 0 when there are no meshes. */
export function bakedFraction(counts: { baked: number; total: number }): number {
  return counts.total > 0 ? Math.min(1, Math.max(0, counts.baked / counts.total)) : 0;
}

/** Cycles AO is already inside baked surfaces: screen-space AO is scaled down so corners are not darkened twice. */
const BAKED_AO_RESIDUAL = 0.25;

export function aoBlendFor(base: number, fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  return +(base * (1 - (1 - BAKED_AO_RESIDUAL) * f)).toFixed(4);
}

/**
 * Sky cards (cloud banks, `ar_cloud*`) are emission in Blender: drawn as their emission colour,
 * never lit by the runtime rig and never fogged. Lit and fogged, they read grey-beige instead of
 * Blender's peach and pink (fidelity r1 Skyline gap).
 */
const SKY_CARD = /^ar_cloud(_|$)/i;
export function isSkyCard(materialName: string | undefined): boolean {
  return !!materialName && SKY_CARD.test(materialName);
}

/** Linear emission colour x strength, the colour a sky card is drawn with. */
export function emissionColor(emissive: readonly [number, number, number], strength: number): [number, number, number] {
  const k = Number.isFinite(strength) && strength > 0 ? strength : 1;
  return [emissive[0] * k, emissive[1] * k, emissive[2] * k];
}
