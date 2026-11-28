/**
 * First playable slice: plaza → OpenPoker → DanGG → plaza, plus the
 * independent Test Builder house on the plaza.
 *
 * Geometry anchors (door positions, salon spawn, obstacles, the arrival square)
 * come from the Blender export manifest (/slice/manifest.json). Merchant
 * identity never comes from here: houses carry only a propertyId and load their
 * owner at runtime.
 *
 * No runtime imports: this module is unit-tested with Node type stripping.
 */
import type { Box } from "../player/cameraRig";
import type { HouseDoor } from "./HouseDoors";

export interface Anchor {
  x: number;
  z: number;
  yaw?: number;
}

export interface PlazaLighting {
  background: string;
  fog: { color: string; near: number; far: number };
  /** Runtime frame (x, y, z), y up. */
  sun: { position: [number, number, number]; color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  /** Optional Blender world gradient stops (lighting.sky_gradient); the client defaults the zenith. */
  skyGradient?: { horizon: string; mid?: string; zenith: string };
  /** Optional low bounce light opposite the sun (lighting.fill); the client has a default. */
  fill?: { color: string; intensity: number };
}

/** Blender arrival square (A01): one GLB in the district frame, fountain at the origin. */
export interface PlazaLayout {
  /** File name inside /slice/. */
  glb: string;
  spawn: Anchor;
  fountain: { x: number; z: number; radius: number; topY: number };
  bounds: Box;
  obstacles: Box[];
  /** Plaza-side threshold of the Test Builder house door; stepping back = +sin(yaw), +cos(yaw). */
  testBuilderDoor: Required<Anchor>;
  /** District chunks the arrival square supersedes; never drawn together with it. */
  replacesChunks: string[];
  lighting: PlazaLighting;
}

export interface SliceLayout {
  /** Plaza-side threshold of the OpenPoker doors and the yaw that faces them. */
  facadeDoor: Anchor;
  salon: {
    spawn: Anchor;
    exit: Anchor;
    danggDoor: Anchor;
    bounds: Box;
    obstacles: Box[];
  };
  /** Present only once the Blender arrival square is exported. */
  plaza?: PlazaLayout;
  source: string;
}

export type Place =
  | { kind: "plaza" }
  | { kind: "venue"; id: "openpoker" }
  | { kind: "house"; door: HouseDoor; from: "plaza" | "openpoker" };

/**
 * The independent Test Builder house stays on the plaza, untouched by the slice.
 * This is the legacy free-standing door; with the arrival square its position
 * comes from the manifest (see testBuilderDoor).
 */
export const TEST_BUILDER_DOOR: HouseDoor = {
  id: "bld_test", propertyId: "prop_test", owner: "usr_test", label: "Test Builder House",
  position: [6, 0, 4], colour: "#2f6f6a", trim: "#b5486b",
};

/** Test Builder door for this layout: the Blender house's threshold when the arrival square exists. */
export function testBuilderDoor(layout: SliceLayout | null): HouseDoor {
  const d = layout?.plaza?.testBuilderDoor;
  if (!d) return TEST_BUILDER_DOOR;
  return { ...TEST_BUILDER_DOOR, position: [d.x, 0, d.z], yaw: d.yaw };
}

/** DanGG's house is reached from inside OpenPoker; its identity loads from the server. */
export function danggDoor(layout: SliceLayout): HouseDoor {
  return {
    id: "bld_dangg", propertyId: "prop_dangg", owner: "usr_dangg", label: "DanGG",
    position: [layout.salon.danggDoor.x, 0, layout.salon.danggDoor.z], colour: "#5b3a5e", trim: "#c9a441",
  };
}

/**
 * Arrival: on the east street (district street_ew, runtime x 13..22), outside
 * Fountain Square, facing west toward the fountain at the origin. yaw π/2 puts
 * the camera on +x looking along -x.
 */
export const STREET_SPAWN: Anchor = { x: 19, z: 0.6, yaw: Math.PI / 2 };

/** Where a fresh player arrives: the Blender camera study's spawn when exported. */
export function streetSpawn(layout: SliceLayout | null): Anchor {
  return layout?.plaza?.spawn ?? STREET_SPAWN;
}

export const DOOR_REACH = 2.4;
const STEP_BACK = 2.6;

export function near(a: Anchor, x: number, z: number, reach = DOOR_REACH) {
  return Math.hypot(a.x - x, a.z - z) < reach;
}

/** Step back from a door threshold along its facing direction (away from the door). */
export function stepBack(a: Anchor, back = STEP_BACK): Anchor {
  const yaw = a.yaw ?? 0;
  return { x: a.x + Math.sin(yaw) * back, z: a.z + Math.cos(yaw) * back, yaw };
}

/** Where a place-change puts the player. Exiting DanGG returns to the plaza at OpenPoker. */
export function arrival(next: Place, prev: Place, layout: SliceLayout): Anchor {
  if (next.kind === "venue") return layout.salon.spawn;
  if (next.kind === "house") return { x: 0, z: 3.2, yaw: 0 };
  if (prev.kind === "house" && prev.door.id === TEST_BUILDER_DOOR.id) {
    if (layout.plaza) return stepBack(layout.plaza.testBuilderDoor);
    return { x: TEST_BUILDER_DOOR.position[0], z: TEST_BUILDER_DOOR.position[2] + 2.8, yaw: 0 };
  }
  return stepBack(layout.facadeDoor);
}

/* ------------------------------------------------------------------ parsing */

interface SliceManifest {
  schema_version: number;
  runtime_layout?: {
    facade_door: Anchor;
    salon: { spawn: Anchor; exit: Anchor; dangg_door: Anchor; bounds: Box; obstacles: Box[] };
    plaza?: unknown;
  };
}

type Obj = Record<string, unknown>;

const HEX = /^#[0-9a-f]{6}$/i;
const GLB_NAME = /^[\w.-]+\.glb$/;

class ManifestError extends Error {}

/** Field readers that throw a ManifestError naming the offending path. */
function reader(base: string) {
  const fail = (path: string, problem: string): never => {
    throw new ManifestError(`${base}.${path} ${problem}`);
  };
  const obj = (v: unknown, path: string): Obj =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : fail(path, "must be an object");
  const num = (v: unknown, path: string): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fail(path, "must be a finite number");
  const hex = (v: unknown, path: string): string =>
    typeof v === "string" && HEX.test(v) ? v : fail(path, 'must be a "#rrggbb" colour');
  const box = (v: unknown, path: string): Box => {
    const o = obj(v, path);
    const b = { minX: num(o.minX, `${path}.minX`), maxX: num(o.maxX, `${path}.maxX`), minZ: num(o.minZ, `${path}.minZ`), maxZ: num(o.maxZ, `${path}.maxZ`) };
    if (b.minX > b.maxX || b.minZ > b.maxZ) fail(path, "has min greater than max");
    return b;
  };
  const anchor = (v: unknown, path: string): Required<Anchor> => {
    const o = obj(v, path);
    return { x: num(o.x, `${path}.x`), z: num(o.z, `${path}.z`), yaw: num(o.yaw, `${path}.yaw`) };
  };
  return { fail, obj, num, hex, box, anchor };
}

function inside(b: Box, x: number, z: number) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function parseLighting(v: unknown, r: ReturnType<typeof reader>): PlazaLighting {
  const l = r.obj(v, "lighting");
  const fog = r.obj(l.fog, "lighting.fog");
  const sun = r.obj(l.sun, "lighting.sun");
  const hemi = r.obj(l.hemisphere, "lighting.hemisphere");
  const pos = Array.isArray(sun.position) && sun.position.length === 3 ? sun.position : r.fail("lighting.sun.position", "must be [x, y, z]");
  const near = r.num(fog.near, "lighting.fog.near");
  const far = r.num(fog.far, "lighting.fog.far");
  if (near < 0 || far <= near) r.fail("lighting.fog", "needs 0 <= near < far");
  const nonNegative = (x: unknown, path: string) => {
    const n = r.num(x, path);
    return n >= 0 ? n : r.fail(path, "must be >= 0");
  };
  const gradient = l.sky_gradient === undefined ? undefined : r.obj(l.sky_gradient, "lighting.sky_gradient");
  const fill = l.fill === undefined ? undefined : r.obj(l.fill, "lighting.fill");
  return {
    ...(gradient && {
      skyGradient: {
        horizon: r.hex(gradient.horizon, "lighting.sky_gradient.horizon"),
        ...(gradient.mid !== undefined && { mid: r.hex(gradient.mid, "lighting.sky_gradient.mid") }),
        zenith: r.hex(gradient.zenith, "lighting.sky_gradient.zenith"),
      },
    }),
    ...(fill && {
      fill: { color: r.hex(fill.color, "lighting.fill.color"), intensity: nonNegative(fill.intensity, "lighting.fill.intensity") },
    }),
    background: r.hex(l.background, "lighting.background"),
    fog: { color: r.hex(fog.color, "lighting.fog.color"), near, far },
    sun: {
      position: [r.num(pos[0], "lighting.sun.position[0]"), r.num(pos[1], "lighting.sun.position[1]"), r.num(pos[2], "lighting.sun.position[2]")],
      color: r.hex(sun.color, "lighting.sun.color"),
      intensity: nonNegative(sun.intensity, "lighting.sun.intensity"),
    },
    hemisphere: {
      sky: r.hex(hemi.sky, "lighting.hemisphere.sky"),
      ground: r.hex(hemi.ground, "lighting.hemisphere.ground"),
      intensity: nonNegative(hemi.intensity, "lighting.hemisphere.intensity"),
    },
  };
}

/** runtime_layout.plaza: absent = undefined (legacy district); malformed = readable error. */
export function parsePlaza(raw: unknown, source: string): PlazaLayout | undefined {
  if (raw === undefined || raw === null) return undefined;
  const r = reader(`slice manifest ${source}: runtime_layout.plaza`);
  const p = r.obj(raw, "(root)");
  const glb = typeof p.glb === "string" && GLB_NAME.test(p.glb) ? p.glb : r.fail("glb", "must be a .glb file name inside /slice/");
  const spawn = r.anchor(p.spawn, "spawn");
  const f = r.obj(p.fountain, "fountain");
  const fountain = { x: r.num(f.x, "fountain.x"), z: r.num(f.z, "fountain.z"), radius: r.num(f.radius, "fountain.radius"), topY: r.num(f.top_y, "fountain.top_y") };
  if (fountain.radius <= 0) r.fail("fountain.radius", "must be > 0");
  if (fountain.topY <= 0) r.fail("fountain.top_y", "must be > 0");
  const bounds = r.box(p.bounds, "bounds");
  if (!Array.isArray(p.obstacles)) r.fail("obstacles", "must be an array");
  const obstacles = (p.obstacles as unknown[]).map((o, i) => r.box(o, `obstacles[${i}]`));
  if (!inside(bounds, spawn.x, spawn.z)) r.fail("spawn", "is outside bounds");
  if (obstacles.some((o) => inside(o, spawn.x, spawn.z))) r.fail("spawn", "is inside an obstacle");
  const testBuilderDoor = r.anchor(p.test_builder_door, "test_builder_door");
  const chunks = p.replaces_chunks;
  if (!Array.isArray(chunks) || chunks.some((c) => typeof c !== "string" || c.length === 0)) {
    r.fail("replaces_chunks", "must be an array of chunk ids");
  }
  return {
    glb,
    spawn,
    fountain,
    bounds,
    obstacles,
    testBuilderDoor,
    replacesChunks: [...(chunks as string[])],
    lighting: parseLighting(p.lighting, r),
  };
}

/** Parses the Blender slice manifest. Throws a readable error when it is missing or incomplete. */
export function parseSliceManifest(raw: unknown, source: string): SliceLayout {
  const m = raw as SliceManifest;
  const r = m?.runtime_layout;
  if (!r?.facade_door || !r.salon?.spawn || !r.salon.exit || !r.salon.dangg_door || !r.salon.bounds) {
    throw new Error(`slice manifest ${source} has no runtime_layout; re-run the Blender slice export`);
  }
  const plaza = parsePlaza(r.plaza, source);
  return {
    facadeDoor: r.facade_door,
    salon: {
      spawn: r.salon.spawn,
      exit: r.salon.exit,
      danggDoor: r.salon.dangg_door,
      bounds: r.salon.bounds,
      obstacles: r.salon.obstacles ?? [],
    },
    ...(plaza ? { plaza } : {}),
    source,
  };
}

export async function loadSliceLayout(url = "/slice/manifest.json"): Promise<SliceLayout> {
  const res = await fetch(url);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) {
    throw new Error("OpenPoker venue not exported yet: run the Blender slice export (app/public/slice/manifest.json is missing).");
  }
  return parseSliceManifest(await res.json(), url);
}
