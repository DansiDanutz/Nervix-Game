/**
 * CT5 on the arrival square: which plaza collision boxes may stop the camera boom.
 *
 * rayBoxDistance treats every box as a full-height wall, but the manifest's plaza obstacles carry
 * no heights: most are waist-high (the fountain basin) or thin props (lamp posts, bollards,
 * benches, urns, planters) that the eye-height boom passes over or beside. Only wall-scale boxes
 * (facades, house and shop walls) stop it. Pure; the house room keeps roomWalls, the salon its boxes.
 */
import type { Box, Vec2 } from "./cameraRig";

export const CAMERA_BLOCKERS = Object.freeze({
  /** A box whose longest footprint side is shorter than this (m) is a prop, never a wall. */
  minWallSide: 3,
});

const longestSide = (b: Box) => Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
const holds = (b: Box, p: Vec2) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;

/** The plaza boxes the boom ray tests: wall-scale ones, minus the fountain basin. */
export function plazaCameraBlockers(obstacles: readonly Box[], fountain: Vec2): readonly Box[] {
  return Object.freeze(obstacles.filter((b) => longestSide(b) >= CAMERA_BLOCKERS.minWallSide && !holds(b, fountain)));
}
