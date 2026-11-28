/**
 * Shared geometry, materials and instance writers for the remote crowd (C6).
 *
 * Full detail is the stylised Avatar.tsx figure rebuilt as one InstancedMesh per body part,
 * coloured per instance from the player's preset, so 30 full-detail players cost 6 draw calls
 * (12 with the shadow-casting near set split out). Everyone else is one instanced impostor.
 * Nothing here allocates per frame: scratch objects are reused inside the render loop.
 */
import * as THREE from "three";
import { AVATAR_BUILD as B, AVATAR_HEIGHT, AVATAR_RADIUS, AVATAR_SCALE } from "../player/avatarShape";
import { AVATAR_PRESETS, type AvatarPalette } from "../net/api/avatar";
import { CROWD_LIMITS, type CrowdPlan, type CrowdEntry } from "../world/remoteCrowd";

/** Presence room capacity (server PRESENCE_ROOM_CAPACITY default): the impostor buffer size. */
export const CROWD_CAPACITY = 200;

type Slot = keyof Pick<AvatarPalette, "tunic" | "trim" | "legs" | "skin" | "hair" | "eyes">;

export interface CrowdPart {
  readonly key: string;
  readonly slot: Slot;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  /** Part transforms in the unscaled avatar frame; one instance per entry per player. */
  readonly locals: readonly THREE.Matrix4[];
}

const at = (x: number, y: number, z: number, rotX = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0)), new THREE.Vector3(1, 1, 1));

const material = (roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness });

/** The Avatar.tsx figure as instanced parts. Segment counts are lowered a little for the crowd. */
export function createCrowdParts(): readonly CrowdPart[] {
  return Object.freeze([
    { key: "legs", slot: "legs", geometry: new THREE.CapsuleGeometry(B.legRadius, B.legLength, 3, 6), material: material(0.8), locals: [at(-B.legX, B.legY, 0), at(B.legX, B.legY, 0)] },
    { key: "body", slot: "tunic", geometry: new THREE.CapsuleGeometry(B.bodyRadius, B.bodyLength, 4, 10), material: material(0.75), locals: [at(0, B.bodyY, 0)] },
    { key: "belt", slot: "trim", geometry: new THREE.CylinderGeometry(B.beltRadius, B.beltRadius, B.beltHeight, 12), material: material(0.45, 0.3), locals: [at(0, B.beltY, 0)] },
    { key: "head", slot: "skin", geometry: new THREE.SphereGeometry(B.headRadius, 12, 10), material: material(0.6), locals: [at(0, B.headY, 0)] },
    { key: "hair", slot: "hair", geometry: new THREE.SphereGeometry(B.hairRadius, 12, 8, 0, Math.PI * 2, 0, B.hairCover), material: material(0.85), locals: [at(0, B.headY, 0, B.hairTilt)] },
    { key: "eyes", slot: "eyes", geometry: new THREE.SphereGeometry(B.eyeRadius, 6, 6), material: material(0.5), locals: [at(-B.eyeX, B.eyeY, B.headRadius * 0.92), at(B.eyeX, B.eyeY, B.headRadius * 0.92)] },
  ] satisfies CrowdPart[]);
}

/** One capsule the height and width of the scaled avatar, tinted with the tunic colour. */
export function createImpostor() {
  const length = Math.max(0.01, AVATAR_HEIGHT - 2 * AVATAR_RADIUS);
  const geometry = new THREE.CapsuleGeometry(AVATAR_RADIUS, length, 2, 6);
  geometry.translate(0, AVATAR_HEIGHT / 2, 0);
  return { geometry, material: material(0.85) };
}

export type PresetColours = ReadonlyMap<string, Readonly<Record<Slot, THREE.Color>>>;

/** THREE colours per preset id, built once. Unknown presets fall back to the remote (terracotta) look. */
export function createPresetColours(): PresetColours {
  const entries = AVATAR_PRESETS.map((p) => {
    const slots: Record<Slot, THREE.Color> = {
      tunic: new THREE.Color(p.palette.tunic), trim: new THREE.Color(p.palette.trim), legs: new THREE.Color(p.palette.legs),
      skin: new THREE.Color(p.palette.skin), hair: new THREE.Color(p.palette.hair), eyes: new THREE.Color(p.palette.eyes),
    };
    return [p.id, Object.freeze(slots)] as const;
  });
  return new Map(entries);
}

const FALLBACK_PRESET = "terracotta";
const coloursOf = (colours: PresetColours, preset: string) => colours.get(preset) ?? colours.get(FALLBACK_PRESET)!;

// Render-loop scratch (reused every frame, never shared outside this module).
const scratch = { base: new THREE.Matrix4(), part: new THREE.Matrix4(), pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };

function baseMatrix(e: CrowdEntry, scale: number): THREE.Matrix4 {
  scratch.pos.set(e.x, 0, e.z);
  scratch.quat.setFromAxisAngle(scratch.up, e.bodyYaw); // already presence yaw + π (remoteCrowd.ts)
  scratch.scale.setScalar(scale);
  return scratch.base.compose(scratch.pos, scratch.quat, scratch.scale);
}

function finish(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Writes one full-detail set (near or mid) of part meshes. `meshes[i]` belongs to `parts[i]`. */
function writeFullSet(parts: readonly CrowdPart[], meshes: readonly (THREE.InstancedMesh | null)[], entries: readonly CrowdEntry[], colours: PresetColours): void {
  parts.forEach((part, p) => {
    const mesh = meshes[p];
    if (!mesh) return;
    const n = part.locals.length;
    entries.forEach((e, i) => {
      const base = baseMatrix(e, AVATAR_SCALE);
      const colour = coloursOf(colours, e.preset)[part.slot];
      part.locals.forEach((local, k) => {
        mesh.setMatrixAt(i * n + k, scratch.part.multiplyMatrices(base, local));
        mesh.setColorAt(i * n + k, colour);
      });
    });
    finish(mesh, entries.length * n);
  });
}

export interface CrowdMeshes {
  readonly near: readonly (THREE.InstancedMesh | null)[];
  readonly mid: readonly (THREE.InstancedMesh | null)[];
  readonly impostor: THREE.InstancedMesh | null;
}

/** Draws a frame plan: near full detail (shadows), mid full detail (no shadows), impostors. */
export function writeCrowd(plan: CrowdPlan, parts: readonly CrowdPart[], meshes: CrowdMeshes, colours: PresetColours): void {
  const full = plan.filter((e) => e.tier === "full").slice(0, CROWD_LIMITS.fullCap);
  writeFullSet(parts, meshes.near, full.filter((e) => e.shadow), colours);
  writeFullSet(parts, meshes.mid, full.filter((e) => !e.shadow), colours);
  const impostor = meshes.impostor;
  if (!impostor) return;
  const far = plan.filter((e) => e.tier === "impostor").slice(0, CROWD_CAPACITY);
  far.forEach((e, i) => {
    impostor.setMatrixAt(i, baseMatrix(e, 1));
    impostor.setColorAt(i, coloursOf(colours, e.preset).tunic);
  });
  finish(impostor, far.length);
}

/**
 * Allocates the per-instance colour buffer at full capacity. three.js would create it lazily at
 * the current `count`, which is 0 after an empty frame and would then never fit a player.
 */
export function prepareInstanced(mesh: THREE.InstancedMesh | null, capacity: number): void {
  if (!mesh || mesh.instanceColor) return;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.count = 0;
}

/** Crowd meshes never take clicks: doors and props behind a player stay clickable. */
export const noRaycast = () => undefined;
