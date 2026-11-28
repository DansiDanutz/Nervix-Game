import test from "node:test";
import assert from "node:assert/strict";
import { bindPointerLockLook, type LockDocument } from "./pointerLockLook.ts";

/** Minimal canvas + document doubles: EventTarget gives real add/remove semantics. */
function setup(opts: { reject?: boolean; throws?: boolean; unsupported?: boolean } = {}) {
  const el = new EventTarget() as EventTarget & { requestPointerLock?: () => unknown };
  const doc = new EventTarget() as EventTarget & LockDocument & { exits: number };
  doc.pointerLockElement = null;
  doc.exits = 0;
  doc.exitPointerLock = () => { doc.exits += 1; doc.pointerLockElement = null; };
  let requests = 0;
  if (!opts.unsupported) {
    el.requestPointerLock = () => {
      requests += 1;
      if (opts.throws) throw new Error("WrongDocumentError");
      if (opts.reject) return Promise.reject(new Error("NotAllowedError"));
      doc.pointerLockElement = el;
      return Promise.resolve();
    };
  }
  const looks: Array<[number, number]> = [];
  const move = (dx: number, dy: number) => doc.dispatchEvent(Object.assign(new Event("mousemove"), { movementX: dx, movementY: dy }));
  return { el, doc, looks, move, requests: () => requests, onLook: (dx: number, dy: number) => looks.push([dx, dy]) };
}

test("a click locks the pointer and mouse movement then turns the camera", async () => {
  const s = setup();
  bindPointerLockLook(s.el, s.doc, s.onLook);
  s.el.dispatchEvent(new Event("click"));
  await Promise.resolve();
  assert.equal(s.requests(), 1);
  s.move(12, -3);
  assert.deepEqual(s.looks, [[12, -3]]);
});

test("movement is ignored while another element (or nothing) holds the lock", () => {
  const s = setup();
  bindPointerLockLook(s.el, s.doc, s.onLook);
  s.move(5, 5);
  s.doc.pointerLockElement = new EventTarget();
  s.move(5, 5);
  assert.deepEqual(s.looks, []);
});

test("a click while already locked does not request again", () => {
  const s = setup();
  bindPointerLockLook(s.el, s.doc, s.onLook);
  s.doc.pointerLockElement = s.el;
  s.el.dispatchEvent(new Event("click"));
  assert.equal(s.requests(), 0);
});

test("a refused, throwing or missing lock never breaks the page", async () => {
  for (const opts of [{ reject: true }, { throws: true }, { unsupported: true }]) {
    const s = setup(opts);
    bindPointerLockLook(s.el, s.doc, s.onLook);
    assert.doesNotThrow(() => s.el.dispatchEvent(new Event("click")));
    await new Promise((r) => setTimeout(r, 0));
    s.move(4, 4);
    assert.deepEqual(s.looks, []);
  }
});

test("unbinding stops listening and releases a lock it holds", () => {
  const s = setup();
  const unbind = bindPointerLockLook(s.el, s.doc, s.onLook);
  s.doc.pointerLockElement = s.el;
  unbind();
  assert.equal(s.doc.exits, 1);
  s.doc.pointerLockElement = s.el;
  s.move(3, 3);
  assert.deepEqual(s.looks, []);
  const t = setup();
  bindPointerLockLook(t.el, t.doc, t.onLook)();
  assert.equal(t.doc.exits, 0, "nothing to release");
});
