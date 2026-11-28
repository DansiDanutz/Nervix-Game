/**
 * A sliding-window write limiter: at most `limit` accepted writes per key in
 * any `windowMs` span. State is per process and in memory (the slice runs one
 * server). Each key's history is replaced, never mutated, on every write.
 */

export function createWriteLimiter({ limit, windowMs, now = Date.now }) {
  if (!(limit > 0)) throw new RangeError("limit must be positive");
  if (!(windowMs > 0)) throw new RangeError("windowMs must be positive");
  const history = new Map(); // key -> frozen array of write timestamps

  const recent = (key, t) => (history.get(key) ?? []).filter((at) => t - at < windowMs);

  return Object.freeze({
    /** Records a write for `key` and returns true, or returns false when the window is full. */
    take(key) {
      const t = now();
      const kept = recent(key, t);
      if (kept.length >= limit) {
        history.set(key, Object.freeze(kept));
        return false;
      }
      history.set(key, Object.freeze([...kept, t]));
      return true;
    },
  });
}
