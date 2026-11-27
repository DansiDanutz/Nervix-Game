import test from "node:test";
import assert from "node:assert/strict";

import { QUEST, newProgress, advance, collectSeal } from "../src/quests.mjs";

test("a new player is at the first step with no seals", () => {
  const p = newProgress();
  assert.equal(p.stepIndex, 0);
  assert.deepEqual(p.seals, []);
  assert.equal(p.completed, false);
});

test("steps advance one at a time and cannot be skipped", () => {
  let p = newProgress();
  assert.equal(advance(p, "seal-cafe").error, "out_of_order");
  p = advance(p, "find-fountain").progress;
  assert.equal(p.stepIndex, 1);
  p = advance(p, "meet-guide").progress;
  assert.equal(p.stepIndex, 2);
});

test("re-sending a step is idempotent", () => {
  const p = advance(newProgress(), "find-fountain").progress;
  const again = advance(p, "find-fountain");
  assert.equal(again.error, "already_done");
  assert.equal(again.progress.stepIndex, 1);
});

test("a seal cannot be collected before its step", () => {
  const p = newProgress();
  assert.equal(collectSeal(p, "seal-cafe").error, "seal_locked");
});

test("collecting all three seals completes the quest without a purchase", () => {
  let p = newProgress();
  p = advance(p, "find-fountain").progress;
  p = advance(p, "meet-guide").progress;
  p = advance(p, "seal-court").progress;
  p = collectSeal(p, "seal-court").progress;
  assert.equal(p.completed, false);

  p = advance(p, "seal-cafe").progress;
  p = collectSeal(p, "seal-cafe").progress;
  p = advance(p, "seal-venue").progress;
  p = collectSeal(p, "seal-venue").progress;

  assert.equal(p.completed, true);
  assert.equal(p.seals.length, 3);
});

test("a seal is collected only once", () => {
  let p = newProgress();
  p = advance(p, "find-fountain").progress;
  p = advance(p, "meet-guide").progress;
  p = advance(p, "seal-court").progress;
  p = collectSeal(p, "seal-court").progress;
  assert.equal(collectSeal(p, "seal-court").error, "already_collected");
});

test("unknown steps and seals are refused", () => {
  const p = newProgress();
  assert.equal(advance(p, "nope").error, "unknown_step");
  assert.equal(collectSeal(p, "nope").error, "unknown_seal");
});

test("the quest has exactly three seals", () => {
  assert.equal(QUEST.seals.length, 3);
});