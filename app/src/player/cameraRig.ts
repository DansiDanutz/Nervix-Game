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
