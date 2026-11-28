/**
 * Pointer travel (px) above which a press-release is a look-drag, not a click.
 * R3F fires onClick on release even after a drag, so a drag to turn the camera
 * that starts and ends over a door hitbox would otherwise walk through the door.
 */
export const CLICK_MAX_TRAVEL_PX = 6;

/** True when the pointer moved little enough between press and release to count as a click. */
export function isDeliberateClick(delta: number): boolean {
  return Number.isFinite(delta) && delta <= CLICK_MAX_TRAVEL_PX;
}
