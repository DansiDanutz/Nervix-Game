/** C3 repair: the per-socket work queue runs tasks in order and caps its depth. */
import test from "node:test";
import assert from "node:assert/strict";

import { createWorkQueue } from "../src/presence-queue.mjs";

test("tasks run one at a time, in order, and a failure does not stop the queue", async () => {
  const ran = [];
  const failures = [];
  const queue = createWorkQueue({ maxDepth: 8, onFailure: (e) => failures.push(e.message), onOverflow: () => assert.fail("no overflow") });
  queue.push(async () => ran.push(1));
  queue.push(async () => {
    throw new Error("boom");
  });
  queue.push(async () => ran.push(3));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(ran, [1, 3]);
  assert.deepEqual(failures, ["boom"]);
  assert.equal(queue.depth(), 0);
});

test("past the cap a task is refused and the overflow is reported once", () => {
  const overflows = [];
  const queue = createWorkQueue({ maxDepth: 2, onFailure: () => {}, onOverflow: (d) => overflows.push(d) });
  const stuck = () => new Promise(() => {});
  assert.equal(queue.push(stuck), true);
  assert.equal(queue.push(stuck), true);
  assert.equal(queue.push(stuck), false);
  assert.equal(queue.push(stuck), false);
  assert.deepEqual(overflows, [2]);
});
