import test from "node:test";
import assert from "node:assert/strict";
import { bubbleAnchors } from "./chatBubbleAnchors.ts";

const bubble = (playerId: string, text: string, self = false) =>
  Object.freeze({ playerId, self, name: playerId.toUpperCase(), text, expiresAt: 1000 });
const player = (id: string, x: number, z: number) => Object.freeze({ id, x, z });

test("a remote bubble is anchored at its speaker's position", () => {
  const anchors = bubbleAnchors([bubble("p1", "hello")], [player("p1", 3, -2)]);
  assert.deepEqual(anchors, [{ key: "p1", text: "hello", name: "P1", self: false, x: 3, z: -2 }]);
});

test("the local bubble carries no position (the scene follows the local player)", () => {
  const anchors = bubbleAnchors([bubble("me", "hi", true)], []);
  assert.deepEqual(anchors, [{ key: "self", text: "hi", name: "ME", self: true }]);
});

test("a bubble whose speaker is not in this place is dropped", () => {
  assert.deepEqual(bubbleAnchors([bubble("gone", "bye")], [player("p1", 0, 0)]), []);
});

test("non-finite positions are dropped, and the output is frozen", () => {
  const anchors = bubbleAnchors([bubble("p1", "x"), bubble("p2", "y")], [player("p1", Number.NaN, 0), player("p2", 1, 1)]);
  assert.deepEqual(anchors.map((a) => a.key), ["p2"]);
  assert.ok(Object.isFrozen(anchors));
  assert.ok(Object.isFrozen(anchors[0]));
});
