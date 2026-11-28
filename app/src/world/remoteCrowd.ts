/**
 * Remote crowd (C6): interpolation of other players between presence ticks, and the level of
 * detail each one is drawn at. Pure and immutable; RemoteCrowd.tsx does the three.js work.
 *
 * Presence sends a `delta` on a 10 Hz tick (PRESENCE_TICK_MS, docs/PERF.md). Each new sample
 * starts a tween from where the avatar is drawn now to the sample, lasting one tick, so motion
 * is continuous and never jumps back. Yaw takes the shortest arc. Long jumps and place changes snap.
 * There is no sequence number on the wire (server/src/presence-privacy.mjs PUBLIC_FIELDS): samples
 * arrive in order on one socket, so the latest one always wins.
 *
 * Facing: presence `yaw` is the sender's look yaw (cameraRig.moveVector: forward = (-sin, -cos),
 * so yaw 0 looks toward -z). The crowd figure looks along its local +z, so the body's rotation.y
 * is yaw + π (the same rule PlayerController uses for the local body). It is converted once, on
 * ingest, into Pose.bodyYaw.
 *
 * LOD, nearest first: full detail for at most the 30 nearest within ~25 m, an instanced impostor
 * for everyone else; labels only on full-detail avatars within ~15 m; shadows only near.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

/** The presence fields the crowd reads: exactly the public view (PUBLIC_FIELDS), no seq. */
export interface RemoteSample {
  readonly id: string;
  readonly name: string;
  readonly place: string;
  readonly preset: string;
  readonly x: number;
  readonly z: number;
  /** Look yaw as presence sends it: forward is (-sin yaw, -cos yaw), so 0 looks toward -z. */
  readonly yaw: number;
}

export interface Pose {
  readonly x: number;
  readonly z: number;
  /**
   * The body's three.js rotation.y, radians, for a figure that looks along local +z
   * (rotation.y = θ faces (sin θ, cos θ)). Always bodyYaw(sample.yaw), never the raw look yaw.
   */
  readonly bodyYaw: number;
}

export interface CrowdTrack {
  readonly id: string;
  readonly name: string;
  readonly place: string;
  readonly preset: string;
  readonly from: Pose;
  readonly to: Pose;
  /** performance.now() (ms) when the tween from `from` to `to` began. */
  readonly start: number;
}

export type Crowd = ReadonlyMap<string, CrowdTrack>;
export type CrowdTier = "full" | "impostor";

export interface CrowdEntry extends Pose {
  readonly id: string;
  readonly name: string;
  readonly preset: string;
  readonly distance: number;
  readonly tier: CrowdTier;
  readonly label: boolean;
  readonly shadow: boolean;
}

export type CrowdPlan = readonly CrowdEntry[];

/** Tween length: one presence tick (server PRESENCE_TICK_MS default). */
export const INTERP_MS = 100;
/** A jump longer than this between samples is a teleport (door, respawn): snap, do not slide. */
export const SNAP_DISTANCE = 6;

export const CROWD_LIMITS = Object.freeze({
  /** Full-detail avatars at most (the nearest). */
  fullCap: 30,
  /** Beyond this (m) every player is an instanced impostor. */
  impostorDistance: 25,
  /** Name labels only within this (m), and only on full-detail avatars. */
  labelDistance: 15,
  labelCap: 12,
  /** Shadow casters only within this (m), nearest first. */
  shadowDistance: 8,
  shadowCap: 8,
  /** A tier, label or shadow already held is kept until this far (m) past its threshold. */
  hysteresis: 1,
});

const TWO_PI = Math.PI * 2;

export function emptyCrowd(): Crowd {
  return new Map();
}

/** Folds an angle into (-π, π]. */
export function wrapAngle(a: number): number {
  const r = ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI; // [-π, π)
  return r <= -Math.PI ? r + TWO_PI : r;
}

/** Interpolates yaw along the shortest arc, so 170° → -170° turns 20°, not 340°. */
export function lerpAngle(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return wrapAngle(a + wrapAngle(b - a) * t);
}

/** Presence look yaw -> body rotation.y facing the same way (+π, folded into (-π, π]). */
export function bodyYaw(lookYaw: number): number {
  return wrapAngle(lookYaw + Math.PI);
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Where the track is drawn at `now` (ms). */
export function poseAt(track: CrowdTrack, now: number): Pose {
  const t = clamp01((now - track.start) / INTERP_MS);
  if (t >= 1) return track.to;
  const { from, to } = track;
  return Object.freeze({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, bodyYaw: lerpAngle(from.bodyYaw, to.bodyYaw, t) });
}

const isFiniteSample = (p: RemoteSample) => Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw);
const poseOf = (p: RemoteSample): Pose => Object.freeze({ x: p.x, z: p.z, bodyYaw: bodyYaw(p.yaw) });
const samePose = (a: Pose, b: Pose) => a.x === b.x && a.z === b.z && a.bodyYaw === b.bodyYaw;

function snapped(p: RemoteSample, now: number): CrowdTrack {
  const pose = poseOf(p);
  return Object.freeze({ id: p.id, name: p.name, place: p.place, preset: p.preset, from: pose, to: pose, start: now });
}

/** The next track for one player, given the one already held (if any). */
function nextTrack(old: CrowdTrack | undefined, p: RemoteSample, now: number): CrowdTrack {
  if (!old || old.place !== p.place) return snapped(p, now);
  const to = poseOf(p);
  if (samePose(old.to, to)) {
    return old.name === p.name && old.preset === p.preset ? old : Object.freeze({ ...old, name: p.name, preset: p.preset });
  }
  const shown = poseAt(old, now);
  if (Math.hypot(p.x - shown.x, p.z - shown.z) > SNAP_DISTANCE) return snapped(p, now);
  return Object.freeze({ id: p.id, name: p.name, place: p.place, preset: p.preset, from: shown, to, start: now });
}

/**
 * Folds the latest presence list into the crowd. Players absent from `players` are dropped.
 * Returns a new map; tracks that did not change keep their identity.
 */
export function ingestPlayers(crowd: Crowd, players: readonly RemoteSample[], now: number): Crowd {
  const next = new Map<string, CrowdTrack>();
  for (const p of players) {
    if (isFiniteSample(p)) next.set(p.id, nextTrack(crowd.get(p.id), p, now));
  }
  return next;
}

interface Flags {
  readonly tier: CrowdTier;
  readonly label: boolean;
  readonly shadow: boolean;
}

/** A threshold widened by the hysteresis margin when the flag was already held. */
const within = (distance: number, limit: number, held: boolean) => distance <= limit + (held ? CROWD_LIMITS.hysteresis : 0);

function flagsFor(distance: number, rank: { full: number; label: number; shadow: number }, prev: Flags | undefined): Flags {
  const L = CROWD_LIMITS;
  const full = rank.full < L.fullCap && within(distance, L.impostorDistance, prev?.tier === "full");
  const label = full && rank.label < L.labelCap && within(distance, L.labelDistance, prev?.label === true);
  const shadow = full && rank.shadow < L.shadowCap && within(distance, L.shadowDistance, prev?.shadow === true);
  return { tier: full ? "full" : "impostor", label, shadow };
}

/**
 * The frame plan: every player's interpolated pose and how to draw it, nearest first.
 * `prev` (last frame's plan) adds hysteresis so avatars at a boundary do not flicker.
 */
export function planCrowd(crowd: Crowd, now: number, camera: { readonly x: number; readonly z: number }, prev: CrowdPlan = []): CrowdPlan {
  const before = new Map(prev.map((e) => [e.id, e] as const));
  const placed = [...crowd.values()]
    .map((track) => ({ track, pose: poseAt(track, now) }))
    .map((e) => ({ ...e, distance: Math.hypot(e.pose.x - camera.x, e.pose.z - camera.z) }))
    .sort((a, b) => a.distance - b.distance || (a.track.id < b.track.id ? -1 : 1));
  const rank = { full: 0, label: 0, shadow: 0 };
  return Object.freeze(
    placed.map(({ track, pose, distance }) => {
      const flags = flagsFor(distance, rank, before.get(track.id));
      if (flags.tier === "full") rank.full += 1;
      if (flags.label) rank.label += 1;
      if (flags.shadow) rank.shadow += 1;
      return Object.freeze({ id: track.id, name: track.name, preset: track.preset, ...pose, distance, ...flags });
    }),
  );
}

/** Counts per tier, for the DEV hook and docs/PERF.md. */
export function crowdStats(plan: CrowdPlan) {
  return Object.freeze({
    total: plan.length,
    full: plan.filter((e) => e.tier === "full").length,
    impostor: plan.filter((e) => e.tier === "impostor").length,
    labels: plan.filter((e) => e.label).length,
    shadows: plan.filter((e) => e.shadow).length,
  });
}

/**
 * The entries that lay a ContactShadow on the baked arrival square, nearest first: every
 * full-detail figure (near and mid), the same set writeCrowd draws in detail. Baked paving never
 * receives the runtime shadow map, so without these the figures float. Impostors get none.
 */
export function contactShadowEntries(plan: CrowdPlan): CrowdPlan {
  return Object.freeze(plan.filter((e) => e.tier === "full").slice(0, CROWD_LIMITS.fullCap));
}
