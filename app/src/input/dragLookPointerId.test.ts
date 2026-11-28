import test from "node:test";
import assert from "node:assert/strict";
import { bindDragLook } from "./pointer.ts";

/**
 * CT4 phone gesture: the left thumb holds a pad button while the right thumb
 * drags the canvas. Only the pointer that pressed the canvas may drive or end
 * the look drag.
 */
const CANVAS_FINGER = 7;
const PAD_FINGER = 3;

const pointer = (type: string, pointerId: number, x: number, y: number, buttons = 1) =>
  Object.assign(new Event(type), { pointerId, clientX: x, clientY: y, buttons });

function setup() {
  const el = new EventTarget();
  const win = new EventTarget();
  const drags: Array<[number, number]> = [];
  const unbind = bindDragLook(el, win, (dx, dy) => drags.push([dx, dy]));
  return { el, win, drags, unbind };
}

test("moves from another pointer (the held pad finger) never feed the look drag", () => {
  const { el, win, drags } = setup();
  el.dispatchEvent(pointer("pointerdown", CANVAS_FINGER, 300, 200));
  win.dispatchEvent(pointer("pointermove", PAD_FINGER, 40, 700));
  win.dispatchEvent(pointer("pointermove", CANVAS_FINGER, 320, 200));
  win.dispatchEvent(pointer("pointermove", PAD_FINGER, 45, 705));
  win.dispatchEvent(pointer("pointermove", CANVAS_FINGER, 330, 205));
  assert.deepEqual(drags, [[20, 0], [10, 5]]);
});

test("lifting or cancelling the pad finger does not end the canvas drag", () => {
  for (const end of ["pointerup", "pointercancel"]) {
    const { el, win, drags } = setup();
    el.dispatchEvent(pointer("pointerdown", CANVAS_FINGER, 300, 200));
    win.dispatchEvent(pointer("pointermove", CANVAS_FINGER, 320, 200));
    win.dispatchEvent(pointer(end, PAD_FINGER, 40, 700, 0));
    win.dispatchEvent(pointer("pointermove", CANVAS_FINGER, 330, 200));
    assert.deepEqual(drags, [[20, 0], [10, 0]], end);
  }
});

test("the canvas finger's own pointerup still ends the drag", () => {
  const { el, win, drags } = setup();
  el.dispatchEvent(pointer("pointerdown", CANVAS_FINGER, 300, 200));
  win.dispatchEvent(pointer("pointermove", CANVAS_FINGER, 320, 200));
  win.dispatchEvent(pointer("pointerup", CANVAS_FINGER, 320, 200, 0));
  win.dispatchEvent(pointer("pointermove", CANVAS_FINGER, 360, 200));
  assert.deepEqual(drags, [[20, 0]]);
});
