/**
 * Pure open/closed rules for registered panels. No React, no DOM.
 * Sets are never mutated: a change returns a new set, no change returns the same one.
 */
export function withPanel(open: ReadonlySet<string>, id: string, next: boolean): ReadonlySet<string> {
  if (open.has(id) === next) return open;
  return next ? new Set([...open, id]) : new Set([...open].filter((x) => x !== id));
}

/**
 * Whether a panel bound to `next` (a property id, or null outside houses) should
 * close. Only a real change does: the first value and re-renders keep the state,
 * and an unmount (for example a collapsed menu) is not a change.
 */
export function closeOnChange<T>(previous: T | undefined, next: T): boolean {
  return previous !== undefined && previous !== next;
}
