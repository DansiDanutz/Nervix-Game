import test from "node:test";
import assert from "node:assert/strict";
import { uniqueById } from "./presence.ts";

test("uniqueById keeps one avatar per player, latest position wins", () => {
  const out = uniqueById([
    { id: "a", name: "A", district: "d", x: 1, z: 1 },
    { id: "b", name: "B", district: "d", x: 2, z: 2 },
    { id: "a", name: "A", district: "d", x: 9, z: 9 },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.find((p) => p.id === "a"), { id: "a", name: "A", district: "d", x: 9, z: 9 });
});
