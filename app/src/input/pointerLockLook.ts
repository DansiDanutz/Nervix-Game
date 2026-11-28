/**
 * CT5 optional pointer lock (off by default, a control setting). When bound, a
 * click on the canvas asks for the lock; while the canvas holds it, raw mouse
 * movement turns the camera with no button held. Esc releases the lock (the
 * browser does that itself). A refused or unsupported lock is ignored, so the
 * normal drag-to-look keeps working.
 */
export interface LockDocument extends EventTarget {
  pointerLockElement: unknown;
  exitPointerLock?: () => void;
}

interface Lockable extends EventTarget {
  requestPointerLock?: () => unknown;
}

interface MovementLike {
  readonly movementX?: number;
  readonly movementY?: number;
}

function requestLock(el: Lockable): void {
  try {
    const result = el.requestPointerLock?.();
    // Newer browsers return a promise that rejects when the lock is refused.
    if (result && typeof (result as Promise<void>).catch === "function") (result as Promise<void>).catch(() => undefined);
  } catch {
    // Unsupported here (iframe sandbox, old browser): drag-to-look still works.
  }
}

/** Returns the unbind; unbinding also releases a lock this element holds. */
export function bindPointerLockLook(el: Lockable, doc: LockDocument, onLook: (dx: number, dy: number) => void): () => void {
  const onClick = () => {
    if (doc.pointerLockElement !== el) requestLock(el);
  };
  const onMove = (e: Event) => {
    if (doc.pointerLockElement !== el) return;
    const m = e as unknown as MovementLike;
    onLook(m.movementX ?? 0, m.movementY ?? 0);
  };
  el.addEventListener("click", onClick);
  doc.addEventListener("mousemove", onMove);
  return () => {
    el.removeEventListener("click", onClick);
    doc.removeEventListener("mousemove", onMove);
    if (doc.pointerLockElement === el) doc.exitPointerLock?.();
  };
}
