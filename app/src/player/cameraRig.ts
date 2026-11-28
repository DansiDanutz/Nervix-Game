/** Pure third-person camera and movement maths, shared by the controller and tests. */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Look {
  yaw: number;
  pitch: number;
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const PITCH_LIMITS = Object.freeze({ min: -0.15, max: 0.9 });

/** Camera position relative to the player. yaw 0 = camera on +z looking toward -z. */
export function cameraOffset(yaw: number, pitch: number, distance: number): Vec2 & { y: number } {
  const flat = Math.cos(pitch) * distance;
  return { x: Math.sin(yaw) * flat, y: Math.sin(pitch) * distance, z: Math.cos(yaw) * flat };
}

export interface ViewRig {
  /** Camera distance behind the player (m). */
  distance: number;
  /** Camera elevation angle (rad) around the player. */
  pitch: number;
  /** Eye height the camera orbits and looks at (m). */
  eye: number;
  /** Sideways camera shift to screen-right (m): keeps the avatar off the centre of the view. */
  shoulder: number;
  /** How far ahead of the player the camera looks (m). */
  lookAhead: number;
  /** Look target sits this far below eye height (m): a level, slightly lowered gaze. */
  lookDrop: number;
}

/**
 * Pedestrian third-person framing. Exterior: eye level ~2 m, level gaze, camera
 * behind the player and shifted 1.3 m to screen-right so the avatar sits in the
 * lower-left of the frame and what the player faces (the fountain on arrival)
 * stays in the horizontal centre.
 */
export const VIEW: Readonly<Record<"exterior" | "interior", Readonly<ViewRig>>> = Object.freeze({
  exterior: Object.freeze({ distance: 3.0, pitch: 0.12, eye: 1.62, shoulder: 1.3, lookAhead: 6, lookDrop: 0.1 }),
  interior: Object.freeze({ distance: 2.6, pitch: 0.05, eye: 1.6, shoulder: 0.5, lookAhead: 6, lookDrop: 0.1 }),
});

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Where the camera sits and what it looks at, for a player at `at` with `look`. */
export function thirdPersonFrame(at: Vec2, look: Look, view: ViewRig): { camera: Vec3; target: Vec3 } {
  const offset = cameraOffset(look.yaw, look.pitch, view.distance);
  const right = moveVector(0, 1, look.yaw);
  const ahead = cameraOffset(look.yaw, 0, -view.lookAhead);
  return {
    camera: {
      x: at.x + offset.x + right.x * view.shoulder,
      y: view.eye + offset.y,
      z: at.z + offset.z + right.z * view.shoulder,
    },
    // Parallel to the player's facing, past the shoulder, so the gaze stays straight ahead.
    target: {
      x: at.x + ahead.x + right.x * view.shoulder,
      y: view.eye - view.lookDrop,
      z: at.z + ahead.z + right.z * view.shoulder,
    },
  };
}

/** Unit ground vector for forward/strafe input, relative to the camera yaw. */
export function moveVector(forward: number, strafe: number, yaw: number): Vec2 {
  if (forward === 0 && strafe === 0) return { x: 0, z: 0 };
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  // Screen-right is forward rotated -90 degrees about +y.
  const x = fx * forward + -fz * strafe;
  const z = fz * forward + fx * strafe;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}

/** Mouse delta (px) to a new look. Dragging right turns right. */
export function applyLook(look: Look, dx: number, dy: number, sensitivity: number): Look {
  const pitch = Math.min(PITCH_LIMITS.max, Math.max(PITCH_LIMITS.min, look.pitch + dy * sensitivity));
  return { yaw: look.yaw - dx * sensitivity, pitch };
}

function hits(p: Vec2, box: Box, radius: number) {
  return p.x > box.minX - radius && p.x < box.maxX + radius && p.z > box.minZ - radius && p.z < box.maxZ + radius;
}

function clampTo(p: Vec2, bounds: number | Box, radius: number): Vec2 {
  const b = typeof bounds === "number" ? { minX: -bounds, maxX: bounds, minZ: -bounds, maxZ: bounds } : bounds;
  return {
    x: Math.min(b.maxX - radius, Math.max(b.minX + radius, p.x)),
    z: Math.min(b.maxZ - radius, Math.max(b.minZ + radius, p.z)),
  };
}

/** Axis-separated collision: keeps the free axis so the player slides along walls. */
export function resolveMove(from: Vec2, to: Vec2, obstacles: Box[], radius: number, bounds: number | Box): Vec2 {
  const target = clampTo(to, bounds, typeof bounds === "number" ? 0 : radius);
  const blocked = (p: Vec2) => obstacles.some((b) => hits(p, b, radius));
  if (!blocked(target)) return target;
  const xOnly = { x: target.x, z: from.z };
  if (!blocked(xOnly)) return xOnly;
  const zOnly = { x: from.x, z: target.z };
  if (!blocked(zOnly)) return zOnly;
  return { ...from };
}

/* ---- CT5: camera pull-in against walls ------------------------------------
 * The camera boom runs from the eye pivot (player position at eye height) to
 * the unobstructed third-person camera. The scene casts that ray (a three.js
 * Raycaster against wall meshes, or rayBoxDistance against the collision
 * boxes) and hands the hit distance back; everything below is pure.
 */

export const CAMERA_COLLISION = Object.freeze({
  /** Stop this far in front of the wall face (m), so the near plane never clips it. */
  margin: 0.2,
  /** Never closer to the eye pivot than this (m): the avatar stays readable. */
  minDistance: 0.6,
  /** Ease-out rate (1/s) when the wall is gone; pull-in is always instant. */
  easeOutRate: 4,
});

/** The exponential follow base for the camera position lerp (per second). */
export const CAMERA_FOLLOW_BASE = 0.0005;

export interface BoomRay {
  readonly origin: Vec3;
  /** Unit vector from the eye pivot toward the camera. */
  readonly direction: Vec3;
  /** Unobstructed boom length (m). */
  readonly length: number;
}

const pivotOf = (at: Vec2, view: ViewRig): Vec3 => ({ x: at.x, y: view.eye, z: at.z });

/** The ray the scene casts to find the first wall between the eye and the camera. */
export function boomRay(at: Vec2, look: Look, view: ViewRig): BoomRay {
  const origin = pivotOf(at, view);
  const { camera } = thirdPersonFrame(at, look, view);
  const d = { x: camera.x - origin.x, y: camera.y - origin.y, z: camera.z - origin.z };
  const length = Math.hypot(d.x, d.y, d.z);
  const direction = length > 0 ? { x: d.x / length, y: d.y / length, z: d.z / length } : { x: 0, y: 0, z: 1 };
  return Object.freeze({ origin: Object.freeze(origin), direction: Object.freeze(direction), length });
}

/** Boom length for a wall hit at `hit` metres along the ray (null: nothing hit). */
export function pullInDistance(desired: number, hit: number | null): number {
  if (hit === null || !Number.isFinite(hit) || hit - CAMERA_COLLISION.margin >= desired) return desired;
  const floor = Math.min(desired, CAMERA_COLLISION.minDistance);
  return Math.max(floor, hit - CAMERA_COLLISION.margin);
}

/** Next boom length: pull in at once (no frame with a wall in view), ease back out; reduced motion snaps. */
export function easeBoom(current: number, target: number, delta: number, reducedMotion: boolean): number {
  if (!Number.isFinite(current) || target <= current || reducedMotion) return target;
  const k = 1 - Math.exp(-CAMERA_COLLISION.easeOutRate * Math.max(0, delta));
  return Math.min(target, current + (target - current) * k);
}

/** The third-person frame with the camera slid in along the boom to `boom` metres (never longer than the rig). */
export function frameAtBoom(at: Vec2, look: Look, view: ViewRig, boom: number): { camera: Vec3; target: Vec3 } {
  const full = thirdPersonFrame(at, look, view);
  const ray = boomRay(at, look, view);
  if (!(boom < ray.length)) return full;
  const d = Math.max(0, boom);
  const { origin: o, direction: u } = ray;
  return { camera: { x: o.x + u.x * d, y: o.y + u.y * d, z: o.z + u.z * d }, target: full.target };
}

/** Entry distance of a ray into one ground-plane box (walls are full height), or null. */
function slabEntry(origin: Vec3, dir: Vec3, box: Box): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (const [o, d, lo, hi] of [[origin.x, dir.x, box.minX, box.maxX], [origin.z, dir.z, box.minZ, box.maxZ]] as const) {
    if (d === 0) {
      if (o <= lo || o >= hi) return null;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  // near < 0: the pivot is inside this box (it cannot be, the player is kept out); ignore it.
  return near >= 0 && near <= far ? near : null;
}

/** Nearest wall hit along the boom against the collision boxes, in metres along the 3D ray, or null. */
export function rayBoxDistance(origin: Vec3, direction: Vec3, length: number, boxes: readonly Box[]): number | null {
  let best: number | null = null;
  for (const box of boxes) {
    const t = slabEntry(origin, direction, box);
    if (t !== null && t <= length && (best === null || t < best)) best = t;
  }
  return best;
}

/** Share of the gap the camera closes this frame: reduced motion snaps (no swoop). */
export function cameraFollowAlpha(delta: number, reducedMotion: boolean): number {
  return reducedMotion ? 1 : 1 - Math.pow(CAMERA_FOLLOW_BASE, delta);
}
