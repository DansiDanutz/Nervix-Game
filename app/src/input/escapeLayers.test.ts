import test from "node:test";
import assert from "node:assert/strict";
import { createEscapeStack } from "./escapeLayers.ts";

test("an empty stack has nothing open and closes nothing", () => {
  const s = createEscapeStack();
  assert.equal(s.hasOpen(), false);
  assert.equal(s.closeTop(), false);
});

test("closeTop closes the most recently opened layer only", () => {
  const s = createEscapeStack();
  const closed: string[] = [];
  s.push(() => closed.push("menu"));
  s.push(() => closed.push("dialog"));
  assert.equal(s.closeTop(), true);
  assert.deepEqual(closed, ["dialog"]);
  assert.equal(s.hasOpen(), true);
  assert.equal(s.closeTop(), true);
  assert.deepEqual(closed, ["dialog", "menu"]);
  assert.equal(s.hasOpen(), false);
});

test("a released layer is no longer open", () => {
  const s = createEscapeStack();
  const release = s.push(() => undefined);
  release();
  release(); // idempotent
  assert.equal(s.hasOpen(), false);
});

test("a layer that is registered but not visible is not open and is never closed", () => {
  const s = createEscapeStack();
  const closed: string[] = [];
  s.push(() => closed.push("visible"));
  s.push(() => closed.push("hidden"), () => false);
  assert.equal(s.hasOpen(), true);
  assert.equal(s.closeTop(), true);
  assert.deepEqual(closed, ["visible"]);
  assert.equal(s.hasOpen(), false);
  assert.equal(s.closeTop(), false);
  assert.deepEqual(closed, ["visible"]);
});

test("visibility is read at key time, so a layer counts once it is shown", () => {
  const s = createEscapeStack();
  let shown = false;
  s.push(() => undefined, () => shown);
  assert.equal(s.hasOpen(), false);
  shown = true;
  assert.equal(s.hasOpen(), true);
});
