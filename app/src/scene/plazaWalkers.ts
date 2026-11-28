/**
 * Ambient pedestrians for the arrival square (A01 / A13-A15 people), built on the K1 rigged kit
 * (app/public/kits/k1, owned by the kit workflow; read only here).
 *
 * Pure planning only: which preset walks where, sampling a walker along its path, keeping paths
 * clear of the manifest obstacles, and reading the kit manifest. Pedestrians.tsx does the three.js
 * work. Walkers never pass behind the street spawn, so they cannot fill the first frame.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */
import type { Box } from "../player/cameraRig";

export type Point = readonly [number, number];
export type WalkerClip = "walk" | "idle" | "talk";

export interface WalkerPlan {
  id: string;
  preset: string;
  clip: WalkerClip;
  /** Polyline in runtime x/z. One point = standing still. */
  path: readonly Point[];
  /** Metres per second along the path (0 when standing). */
  speed: number;
  /** Start offset along the ping-pong cycle, metres. */
  offset: number;
  /** Facing when standing still, radians (rotation.y; 0 faces +z). */
  yaw?: number;
}

/** K1 walk clip speed (manifest clips.walk.speed_mps): feet do not slide at this pace. */
export const WALK_SPEED = 1.4;
/** Clearance kept from obstacle boxes (half a shoulder width plus a little). */
export const WALKER_MARGIN = 0.35;
const SAMPLE_STEP = 0.25;

export function arcPoints(cx: number, cz: number, radius: number, fromDeg: number, toDeg: number, segments: number): Point[] {
  const n = Math.max(1, Math.floor(segments));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / n) * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cz + radius * Math.sin(a)] as const;
  });
}

export function pathLength(path: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return len;
}

export interface Pose {
  x: number;
  z: number;
  /** rotation.y for a +z-forward model. */
  heading: number;
}

/** Position and heading `distance` metres into a ping-pong walk along `path`. */
export function samplePath(path: readonly Point[], distance: number): Pose {
  if (path.length === 0) throw new Error("walker path: no points");
  const len = pathLength(path);
  if (path.length === 1 || len === 0) return { x: path[0][0], z: path[0][1], heading: 0 };
  const cycle = 2 * len;
  const d = ((distance % cycle) + cycle) % cycle;
  const back = d > len;
  let along = back ? cycle - d : d;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (along <= seg || i === path.length - 1) {
      const t = seg > 0 ? Math.min(1, along / seg) : 0;
      const dx = back ? ax - bx : bx - ax;
      const dz = back ? az - bz : bz - az;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(dx, dz) };
    }
    along -= seg;
  }
  /* c8 ignore next */
  return { x: path[path.length - 1][0], z: path[path.length - 1][1], heading: 0 };
}

function inside(b: Box, x: number, z: number, margin: number) {
  return x >= b.minX - margin && x <= b.maxX + margin && z >= b.minZ - margin && z <= b.maxZ + margin;
}

/** True when every point along the path (sampled every 25 cm) is clear of the boxes and inside bounds. */
export function pathClear(path: readonly Point[], obstacles: readonly Box[], bounds: Box, margin = WALKER_MARGIN): boolean {
  const len = pathLength(path);
  const steps = Math.max(1, Math.ceil((2 * len) / SAMPLE_STEP));
  for (let i = 0; i <= steps; i++) {
    const p = samplePath(path, (i / steps) * len);
    if (!inside(bounds, p.x, p.z, -margin)) return false;
    if (obstacles.some((b) => inside(b, p.x, p.z, margin))) return false;
  }
  return true;
}

/**
 * The square's ambient cast, around the fountain at the origin (runtime frame; the street spawn
 * is at x ~ 19-22 looking -x). Presets are K1 ids: burgundy coat (A13), linen apron (A14),
 * traveller shawl (A15), teal tunic and the A01 robes.
 */
export const PLAZA_WALKERS: readonly WalkerPlan[] = Object.freeze([
  { id: "fountain_arc", preset: "sage", clip: "walk", path: arcPoints(0, 0, 6.6, -60, 60, 12), speed: WALK_SPEED, offset: 0 },
  { id: "street_north", preset: "burgundy", clip: "walk", path: [[8.5, 1.8], [16.5, 1.8]], speed: WALK_SPEED, offset: 3 },
  { id: "street_south", preset: "traveller", clip: "walk", path: [[16.5, -1.8], [8.5, -1.8]], speed: WALK_SPEED * 0.9, offset: 9 },
  { id: "talk_a", preset: "linen", clip: "talk", path: [[6.4, -4.1]], speed: 0, offset: 0, yaw: Math.atan2(0.7, 0.55) },
  { id: "talk_b", preset: "terracotta", clip: "idle", path: [[7.1, -3.55]], speed: 0, offset: 0, yaw: Math.atan2(-0.7, -0.55) },
]);

/** Walkers whose whole path is clear; the rest are dropped (the export moved something). */
export function clearWalkers(plans: readonly WalkerPlan[], obstacles: readonly Box[], bounds: Box): WalkerPlan[] {
  return plans.filter((w) => pathClear(w.path, obstacles, bounds));
}

/* ------------------------------------------------------------- K1 kit manifest */

export interface K1Kit {
  glb: string;
  parts: { id: string; node: string; category: string }[];
  presets: { id: string; parts: string[]; palette: Record<string, string> }[];
  /** Slot -> material name. */
  slots: Record<string, string>;
  clips: string[];
}

const HEX = /^#[0-9a-f]{6}$/i;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, path: string): string => {
  if (typeof v !== "string" || !v) throw new Error(`k1 manifest: ${path} must be a non-empty string`);
  return v;
};

export function parseK1(json: unknown): K1Kit {
  if (!isObj(json)) throw new Error("k1 manifest: not an object");
  const list = (v: unknown, path: string) => {
    if (!Array.isArray(v)) throw new Error(`k1 manifest: ${path} must be an array`);
    return v.map((x, i) => {
      if (!isObj(x)) throw new Error(`k1 manifest: ${path}[${i}] must be an object`);
      return x;
    });
  };
  const slotsRaw = json.material_slots;
  if (!isObj(slotsRaw)) throw new Error("k1 manifest: material_slots must be an object");
  const slots = Object.fromEntries(Object.entries(slotsRaw).map(([k, v]) => [k, str(v, `material_slots.${k}`)]));
  return {
    glb: str(json.glb, "glb"),
    parts: list(json.parts, "parts").map((p, i) => ({ id: str(p.id, `parts[${i}].id`), node: str(p.node, `parts[${i}].node`), category: str(p.category, `parts[${i}].category`) })),
    presets: list(json.presets, "presets").map((p, i) => {
      const palette = isObj(p.palette) ? p.palette : {};
      return {
        id: str(p.id, `presets[${i}].id`),
        parts: Array.isArray(p.parts) ? p.parts.map((x, j) => str(x, `presets[${i}].parts[${j}]`)) : [],
        palette: Object.fromEntries(Object.entries(palette).filter(([, v]) => typeof v === "string" && HEX.test(v)) as [string, string][]),
      };
    }),
    slots,
    clips: list(json.clips, "clips").map((c, i) => str(c.name, `clips[${i}].name`)),
  };
}

/** Node names shown for a preset: every base part plus the preset's own parts. */
export function visibleNodes(kit: K1Kit, presetId: string): Set<string> {
  const preset = kit.presets.find((p) => p.id === presetId);
  const wanted = new Set(preset?.parts ?? []);
  return new Set(kit.parts.filter((p) => p.category === "base" || wanted.has(p.id)).map((p) => p.node));
}
