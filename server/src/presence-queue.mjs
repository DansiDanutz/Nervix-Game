/**
 * The per-socket work queue for joins, place changes and chat (C3 repair).
 * Tasks run one at a time in arrival order. The queue has a depth cap: a
 * socket that piles up more pending work than that (for example behind a slow
 * store) is reported through `onOverflow`, and the task is not queued.
 */

export const DEFAULT_MAX_QUEUE = 16;
/** Place changes and joins per socket: a few doors in a row, then about one a second. */
export const DEFAULT_PLACE_LIMIT = Object.freeze({ burst: 8, perSecond: 1 });

export function createWorkQueue({ maxDepth = DEFAULT_MAX_QUEUE, onFailure, onOverflow }) {
  let tail = Promise.resolve();
  let depth = 0;
  let overflowed = false;
  return Object.freeze({
    /** Queues `task`; false (and `onOverflow` once) when the cap is reached. */
    push(task) {
      if (overflowed) return false;
      if (depth >= maxDepth) {
        overflowed = true;
        onOverflow(depth);
        return false;
      }
      depth += 1;
      tail = tail.then(task).catch(onFailure).finally(() => {
        depth -= 1;
      });
      return true;
    },
    depth: () => depth,
  });
}
