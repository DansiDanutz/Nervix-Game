/**
 * A manual clock for presence tests: `now`, `setInterval` and `clearInterval`
 * that only move when the test calls `advance(ms)`. Intervals fire in due
 * order, each as many times as fits in the advanced span.
 */
export function createFakeClock(start = 0) {
  let t = start;
  let nextId = 1;
  const timers = new Map(); // id -> { fn, ms, due }

  const earliestDue = (end) => {
    let found = null;
    for (const [id, timer] of timers) {
      if (timer.due <= end && (!found || timer.due < found.timer.due)) found = { id, timer };
    }
    return found;
  };

  return Object.freeze({
    now: () => t,
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, Object.freeze({ fn, ms, due: t + ms }));
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    /** Moves time forward by `ms`, firing every interval that comes due. */
    advance(ms) {
      const end = t + ms;
      for (let due = earliestDue(end); due; due = earliestDue(end)) {
        t = due.timer.due;
        timers.set(due.id, Object.freeze({ ...due.timer, due: due.timer.due + due.timer.ms }));
        due.timer.fn();
      }
      t = end;
    },
    pending: () => timers.size,
  });
}
