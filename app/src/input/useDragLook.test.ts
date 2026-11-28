import test from "node:test";
import assert from "node:assert/strict";
import { bindDragLook } from "./pointer.ts";

const pointer = (type: string, x: number, y: number, buttons = 1) =>
  Object.assign(new Event(type), { clientX: x, clientY: y, buttons });

function setup() {
  const el = new EventTarget();
  const win = new EventTarget();
  const drags: Array<[number, number]> = [];
  const unbind = bindDragLook(el, win, (dx, dy) => drags.push([dx, dy]));
  return { el, win, drags, unbind };
}

test("a press within the click threshold never orbits (the door keeps its click)", () => {
  const { el, win, drags } = setup();
  el.dispatchEvent(pointer("pointerdown", 100, 100));
  win.dispatchEvent(pointer("pointermove", 103, 102));
  win.dispatchEvent(pointer("pointerup", 103, 102, 0));
  assert.deepEqual(drags, []);
});

test("a drag past the threshold reports deltas from the last point", () => {
  const { el, win, drags } = setup();
  el.dispatchEvent(pointer("pointerdown", 100, 100));
  win.dispatchEvent(pointer("pointermove", 120, 100));
  win.dispatchEvent(pointer("pointermove", 130, 95));
  assert.deepEqual(drags, [[20, 0], [10, -5]]);
});

test("pointercancel ends the drag", () => {
  const { el, win, drags } = setup();
  el.dispatchEvent(pointer("pointerdown", 100, 100));
  win.dispatchEvent(pointer("pointercancel", 100, 100, 0));
  win.dispatchEvent(pointer("pointermove", 150, 100));
  assert.deepEqual(drags, []);
});

test("moves with no button held never orbit; unbinding removes listeners", () => {
  const { el, win, drags, unbind } = setup();
  el.dispatchEvent(pointer("pointerdown", 100, 100));
  win.dispatchEvent(pointer("pointermove", 150, 100, 0));
  assert.deepEqual(drags, []);
  unbind();
  el.dispatchEvent(pointer("pointerdown", 100, 100));
  win.dispatchEvent(pointer("pointermove", 150, 100));
  assert.deepEqual(drags, []);
});
