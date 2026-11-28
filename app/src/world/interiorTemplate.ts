/**
 * B4 interior template: parses the K2 house-kit manifest
 * (app/public/kits/k2/manifest.json), picks a variant for a plot
 * deterministically, and maps that variant to the interior anchors the scene
 * needs (door, counter, NPC station, shelves, display slots). Pure and frozen;
 * no runtime imports, so it is unit-tested with Node type stripping.
 *
 * K2 coordinates: +Y up, origin on the ground at the front facade centre, the
 * facade faces +Z and the house extends to -Z.
 */

export type Vec3 = readonly [number, number, number];
export type SizeClass = "small" | "medium" | "large";

export interface K2Slot {
  readonly node: string;
  readonly index: number;
  readonly position: Vec3;
  readonly surface: string;
  readonly maxExtent: Vec3;
}

export interface K2Variant {
  readonly id: string;
  readonly file: string;
  readonly sizeClass: SizeClass;
  readonly facade: string;
  readonly door: { readonly node: string; readonly position: Vec3; readonly outward: Vec3 };
  readonly sign: { readonly node: string; readonly position: Vec3; readonly normal: Vec3; readonly size: readonly [number, number]; readonly surfaceNode: string };
  readonly station: { readonly node: string; readonly position: Vec3; readonly facing: Vec3 };
  readonly slots: readonly K2Slot[];
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
}

export interface K2Kit {
  readonly kit: string;
  readonly version: number;
  readonly houses: readonly K2Variant[];
}

export interface InteriorShelf {
  readonly id: string;
  readonly y: number;
  readonly position: Vec3;
  readonly slots: readonly string[];
}

export interface InteriorTemplate {
  readonly variantId: string;
  readonly door: { readonly position: Vec3; readonly outward: Vec3 };
  readonly counter: { readonly position: Vec3; readonly facing: Vec3 };
  readonly npcStation: { readonly position: Vec3; readonly facing: Vec3 };
  readonly shelves: readonly InteriorShelf[];
  readonly displaySlots: readonly K2Slot[];
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
}

/** The K2 kit has no counter empty; the counter sits this far in front of the station, along its facing (m). */
export const COUNTER_OFFSET = 0.7;
const SIZE_CLASSES: readonly SizeClass[] = ["small", "medium", "large"];
const DEFAULT_SIZE: SizeClass = "medium";
const GLB_FILE = /^[a-z0-9_]{1,64}\.glb$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LEVEL_PRECISION = 100;

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (path: string, what: string): never => {
  throw new Error(`k2 manifest: ${path} ${what}`);
};
const rec = (v: unknown, path: string): Raw => (isRecord(v) ? v : fail(path, "must be an object"));
const str = (v: unknown, path: string): string => (typeof v === "string" && v.length > 0 ? v : fail(path, "must be a non-empty string"));
const num = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(path, "must be a finite number"));
const nums = (v: unknown, n: number, path: string): number[] =>
  Array.isArray(v) && v.length === n ? v.map((x, i) => num(x, `${path}[${i}]`)) : fail(path, `must be ${n} numbers`);
const vec3 = (v: unknown, path: string): Vec3 => Object.freeze(nums(v, 3, path)) as unknown as Vec3;
const matching = (v: unknown, re: RegExp, path: string) => (re.test(str(v, path)) ? (v as string) : fail(path, `is not allowed: ${String(v)}`));

export function normaliseSizeClass(raw: unknown): SizeClass {
  const lower = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (SIZE_CLASSES as readonly string[]).includes(lower) ? (lower as SizeClass) : DEFAULT_SIZE;
}

function parseSlot(raw: unknown, path: string): K2Slot {
  const s = rec(raw, path);
  const node = matching(s.node, /^slot_\d{1,3}$/, `${path}.node`);
  return Object.freeze({
    node,
    index: Number(node.slice("slot_".length)),
    position: vec3(s.position, `${path}.position`),
    surface: str(s.surface, `${path}.surface`),
    maxExtent: vec3(s.max_extent, `${path}.max_extent`),
  });
}

function parseAnchors(raw: unknown, path: string): Pick<K2Variant, "door" | "sign" | "station"> {
  const a = rec(raw, path);
  const door = rec(a.door, `${path}.door`);
  const sign = rec(a.sign, `${path}.sign`);
  const station = rec(a.station, `${path}.station`);
  return {
    door: Object.freeze({ node: str(door.node, `${path}.door.node`), position: vec3(door.position, `${path}.door.position`), outward: vec3(door.outward, `${path}.door.outward`) }),
    sign: Object.freeze({
      node: str(sign.node, `${path}.sign.node`),
      position: vec3(sign.position, `${path}.sign.position`),
      normal: vec3(sign.normal, `${path}.sign.normal`),
      size: Object.freeze(nums(sign.size, 2, `${path}.sign.size`)) as unknown as readonly [number, number],
      surfaceNode: str(sign.surface_node, `${path}.sign.surface_node`),
    }),
    station: Object.freeze({ node: str(station.node, `${path}.station.node`), position: vec3(station.position, `${path}.station.position`), facing: vec3(station.facing, `${path}.station.facing`) }),
  };
}

function parseVariant(raw: unknown, path: string): K2Variant {
  const h = rec(raw, path);
  const interior = rec(h.interior, `${path}.interior`);
  const bounds = rec(interior.bounds, `${path}.interior.bounds`);
  const slots = Array.isArray(h.slots) ? h.slots.map((s, i) => parseSlot(s, `${path}.slots[${i}]`)) : fail(`${path}.slots`, "must be an array");
  return Object.freeze({
    id: matching(h.id, ID, `${path}.id`),
    file: matching(h.file, GLB_FILE, `${path}.file`),
    sizeClass: normaliseSizeClass(str(h.size_class, `${path}.size_class`)),
    facade: str(h.facade, `${path}.facade`),
    ...parseAnchors(h.anchors, `${path}.anchors`),
    slots: Object.freeze([...slots].sort((a, b) => a.index - b.index)),
    bounds: Object.freeze({ min: vec3(bounds.min, `${path}.interior.bounds.min`), max: vec3(bounds.max, `${path}.interior.bounds.max`) }),
  });
}

/** Validates the K2 manifest (external data); throws with the failing path. */
export function parseK2(json: unknown): K2Kit {
  const m = rec(json, "root");
  if (!Array.isArray(m.houses)) fail("houses", "must be an array");
  const houses = (m.houses as unknown[]).map((h, i) => parseVariant(h, `houses[${i}]`));
  return Object.freeze({ kit: typeof m.kit === "string" ? m.kit : "k2", version: typeof m.version === "number" ? m.version : 0, houses: Object.freeze(houses) });
}

/** FNV-1a 32-bit: stable across sessions and platforms. */
export function variantHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Same propertyId + size class -> same variant, every load. Falls back to any variant if the class is missing. */
export function selectVariant(kit: K2Kit, propertyId: string, sizeClass: unknown): K2Variant {
  if (kit.houses.length === 0) throw new Error("k2 kit has no variants");
  const size = normaliseSizeClass(sizeClass);
  const sameSize = kit.houses.filter((h) => h.sizeClass === size);
  const pool = [...(sameSize.length ? sameSize : kit.houses)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pool[variantHash(`${propertyId}|${size}`) % pool.length];
}

function shelves(slots: readonly K2Slot[]): readonly InteriorShelf[] {
  const onShelf = slots.filter((s) => s.surface === "shelf");
  const levels = [...new Set(onShelf.map((s) => Math.round(s.position[1] * LEVEL_PRECISION)))].sort((a, b) => a - b);
  return Object.freeze(levels.map((level, i) => {
    const row = onShelf.filter((s) => Math.round(s.position[1] * LEVEL_PRECISION) === level);
    const mean = (k: 0 | 2) => row.reduce((sum, s) => sum + s.position[k], 0) / row.length;
    return Object.freeze({
      id: `shelf_${i + 1}`,
      y: level / LEVEL_PRECISION,
      position: Object.freeze([mean(0), level / LEVEL_PRECISION, mean(2)]) as Vec3,
      slots: Object.freeze(row.map((s) => s.node)),
    });
  }));
}

/** Maps a K2 variant to its interior anchors (variant-local coordinates). */
export function interiorTemplate(variant: K2Variant): InteriorTemplate {
  const [sx, sy, sz] = variant.station.position;
  const [fx, , fz] = variant.station.facing;
  return Object.freeze({
    variantId: variant.id,
    door: Object.freeze({ position: variant.door.position, outward: variant.door.outward }),
    counter: Object.freeze({ position: Object.freeze([sx + fx * COUNTER_OFFSET, sy, sz + fz * COUNTER_OFFSET]) as Vec3, facing: variant.station.facing }),
    npcStation: Object.freeze({ position: variant.station.position, facing: variant.station.facing }),
    shelves: shelves(variant.slots),
    displaySlots: variant.slots,
    bounds: variant.bounds,
  });
}

export interface PlotPose {
  readonly door: { readonly x: number; readonly z: number; readonly yaw: number };
  readonly outward: { readonly x: number; readonly z: number };
}

/**
 * Root transform that puts the variant's door anchor on the plot threshold with
 * the facade (+Z local) facing the plot's outward vector. A zero outward vector
 * falls back to the plot yaw. Matches three.js rotation.y.
 */
export function placeHouse(plot: PlotPose, variant: K2Variant): { readonly position: Vec3; readonly yaw: number } {
  const { x: ox, z: oz } = plot.outward;
  const yaw = Math.hypot(ox, oz) > 1e-9 ? Math.atan2(ox, oz) : plot.door.yaw;
  const [dx, , dz] = variant.door.position;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const position = Object.freeze([plot.door.x - (c * dx + s * dz), 0, plot.door.z - (-s * dx + c * dz)]) as Vec3;
  return Object.freeze({ position, yaw });
}
