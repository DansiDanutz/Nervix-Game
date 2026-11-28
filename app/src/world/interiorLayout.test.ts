import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interiorTemplate, parseK2, selectVariant } from "./interiorTemplate.ts";
import { interiorRoomLayout, ROOM_FRAME } from "./interiorLayout.ts";

const kit = parseK2(JSON.parse(readFileSync(new URL("../../public/kits/k2/manifest.json", import.meta.url), "utf8")));
const templateOf = (propertyId: string, size = "medium") => interiorTemplate(selectVariant(kit, propertyId, size));

test("the K2 facade sits on the room's front wall, so the K2 door is the room's front exit", () => {
  const layout = interiorRoomLayout(templateOf("prop_test"), ROOM_FRAME);
  assert.deepEqual(layout.origin, [0, 0, ROOM_FRAME.depth / 2]);
});

test("every display slot, the counter and the NPC station land inside the walk-in room", () => {
  for (const size of ["small", "medium", "large"]) {
    const t = templateOf("prop_dangg", size);
    const layout = interiorRoomLayout(t, ROOM_FRAME);
    const inRoom = ([x, , z]: readonly number[]) => {
      const wx = x + layout.origin[0];
      const wz = z + layout.origin[2];
      return Math.abs(wx) < ROOM_FRAME.width / 2 && Math.abs(wz) < ROOM_FRAME.depth / 2;
    };
    for (const s of t.displaySlots) assert.ok(inRoom(s.position), `${size} ${s.node}`);
    assert.ok(inRoom(t.counter.position), `${size} counter`);
    assert.ok(inRoom(t.npcStation.position), `${size} station`);
  }
});

test("nothing from the template stands within reach of the back exit door", () => {
  const backExit = { x: 0, z: -4.0 };
  for (const size of ["small", "medium", "large"]) {
    const t = templateOf("prop_test", size);
    const layout = interiorRoomLayout(t, ROOM_FRAME);
    for (const [x, , z] of [...t.displaySlots.map((s) => s.position), t.counter.position, t.npcStation.position]) {
      assert.ok(Math.hypot(x + layout.origin[0] - backExit.x, z + layout.origin[2] - backExit.z) > 1.5, `${size} blocks the back exit`);
    }
  }
});

test("one shelf board per shelf level spans its slots, and the counter faces into the room", () => {
  const t = templateOf("prop_test", "large");
  const layout = interiorRoomLayout(t, ROOM_FRAME);
  assert.equal(layout.shelfBoards.length, t.shelves.length);
  for (const [i, board] of layout.shelfBoards.entries()) {
    const slots = t.displaySlots.filter((s) => t.shelves[i].slots.includes(s.node));
    for (const s of slots) assert.ok(Math.abs(s.position[0] - board.position[0]) <= board.size[0] / 2 + 1e-9);
    assert.ok(board.position[1] < t.shelves[i].y, "the board sits under the products");
  }
  assert.equal(layout.counter.yaw, Math.atan2(t.counter.facing[0], t.counter.facing[2]));
});

test("the layout is frozen and leaves the template untouched", () => {
  const t = templateOf("prop_test");
  const before = JSON.stringify(t);
  const layout = interiorRoomLayout(t, ROOM_FRAME);
  assert.ok(Object.isFrozen(layout));
  assert.ok(Object.isFrozen(layout.shelfBoards));
  assert.equal(JSON.stringify(t), before);
});
