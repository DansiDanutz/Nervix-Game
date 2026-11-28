/**
 * Mouse look: a press that travels further than this is a camera drag, not a
 * click. Equal to CLICK_MAX_TRAVEL_PX in scene/clickGuard.ts (a test guards
 * drift), so a press either turns the camera or clicks a door, never both.
 */
export const LOOK_DRAG_THRESHOLD_PX = 6;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export function isLookDrag(start: ScreenPoint, now: ScreenPoint): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) > LOOK_DRAG_THRESHOLD_PX;
}

interface PointerLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly buttons: number;
  /** Absent on synthetic events; then every event counts as the same pointer. */
  readonly pointerId?: number;
}

/**
 * Mouse look: a press on `el` that travels past the click threshold orbits
 * (reports dx, dy); a shorter press is left alone so doors keep their click.
 * pointerup and pointercancel end the drag. Only the pointer that pressed `el`
 * drives or ends it, so a thumb held on the touch pad (another pointer id)
 * neither moves the camera nor ends a canvas drag. Returns the unbind.
 */
export function bindDragLook(el: EventTarget, win: EventTarget, onDrag: (dx: number, dy: number) => void): () => void {
  let start: ScreenPoint | null = null;
  let last: ScreenPoint | null = null;
  let dragging = false;
  let owner: number | undefined;
  const isOwner = (e: Event) => (e as unknown as PointerLike).pointerId === owner;
  const onDown = (e: Event) => {
    const p = e as unknown as PointerLike;
    start = last = { x: p.clientX, y: p.clientY };
    owner = p.pointerId;
    dragging = false;
  };
  const onMove = (e: Event) => {
    const p = e as unknown as PointerLike;
    if (!start || !last || p.buttons === 0 || !isOwner(e)) return;
    const now = { x: p.clientX, y: p.clientY };
    if (!dragging && !isLookDrag(start, now)) return;
    dragging = true;
    onDrag(now.x - last.x, now.y - last.y);
    last = now;
  };
  const onEnd = (e: Event) => {
    if (!isOwner(e)) return;
    start = last = null;
  };
  el.addEventListener("pointerdown", onDown);
  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerup", onEnd);
  win.addEventListener("pointercancel", onEnd);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    win.removeEventListener("pointermove", onMove);
    win.removeEventListener("pointerup", onEnd);
    win.removeEventListener("pointercancel", onEnd);
  };
}
