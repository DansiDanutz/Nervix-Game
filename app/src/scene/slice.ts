/**
 * First playable slice: plaza → OpenPoker → DanGG → plaza, plus the
 * independent Test Builder house on the plaza.
 *
 * Geometry anchors (door positions, salon spawn, obstacles) come from the
 * Blender export manifest (/slice/manifest.json). Merchant identity never comes
 * from here: houses carry only a propertyId and load their owner at runtime.
 */
import type { Box } from "../player/cameraRig";
import type { HouseDoor } from "./HouseDoors";

export interface Anchor {
  x: number;
  z: number;
  yaw?: number;
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
  source: string;
}

export type Place =
  | { kind: "plaza" }
  | { kind: "venue"; id: "openpoker" }
  | { kind: "house"; door: HouseDoor; from: "plaza" | "openpoker" };

/** The independent Test Builder house stays on the plaza, untouched by the slice. */
export const TEST_BUILDER_DOOR: HouseDoor = {
  id: "bld_test", propertyId: "prop_test", owner: "usr_test", label: "Test Builder House",
  position: [6, 0, 4], colour: "#2f6f6a", trim: "#b5486b",
};

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

export const DOOR_REACH = 2.4;

export function near(a: Anchor, x: number, z: number, reach = DOOR_REACH) {
  return Math.hypot(a.x - x, a.z - z) < reach;
}

/** Where a place-change puts the player. Exiting DanGG returns to the plaza at OpenPoker. */
export function arrival(next: Place, prev: Place, layout: SliceLayout): Anchor {
  const out = (a: Anchor, back = 2.6): Anchor => {
    const yaw = a.yaw ?? 0;
    // Step back from the door along the facing direction (away from the doors).
    return { x: a.x + Math.sin(yaw) * back, z: a.z + Math.cos(yaw) * back, yaw };
  };
  if (next.kind === "venue") return layout.salon.spawn;
  if (next.kind === "house") return { x: 0, z: 3.2, yaw: 0 };
  if (prev.kind === "house" && prev.door.id === TEST_BUILDER_DOOR.id) {
    return { x: TEST_BUILDER_DOOR.position[0], z: TEST_BUILDER_DOOR.position[2] + 2.8, yaw: 0 };
  }
  return out(layout.facadeDoor);
}

interface ManifestMarker {
  id: string;
  kind?: string;
  runtime?: { x: number; z: number; yaw?: number };
}

interface SliceManifest {
  schema_version: number;
  runtime_layout?: {
    facade_door: Anchor;
    salon: { spawn: Anchor; exit: Anchor; dangg_door: Anchor; bounds: Box; obstacles: Box[] };
  };
  markers?: ManifestMarker[];
}

/** Parses the Blender slice manifest. Throws a readable error when it is missing or incomplete. */
export function parseSliceManifest(raw: unknown, source: string): SliceLayout {
  const m = raw as SliceManifest;
  const r = m?.runtime_layout;
  if (!r?.facade_door || !r.salon?.spawn || !r.salon.exit || !r.salon.dangg_door || !r.salon.bounds) {
    throw new Error(`slice manifest ${source} has no runtime_layout; re-run the Blender slice export`);
  }
  return {
    facadeDoor: r.facade_door,
    salon: {
      spawn: r.salon.spawn,
      exit: r.salon.exit,
      danggDoor: r.salon.dangg_door,
      bounds: r.salon.bounds,
      obstacles: r.salon.obstacles ?? [],
    },
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
