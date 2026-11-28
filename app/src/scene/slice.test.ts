// Run from app/: node --test src/scene/slice.test.ts (Node type stripping, no deps)
import test from "node:test";
import assert from "node:assert/strict";
import {
  arrival, parsePlaza, parseSliceManifest, streetSpawn, testBuilderDoor,
  STREET_SPAWN, TEST_BUILDER_DOOR, type Place,
} from "./slice.ts";

const LEGACY = {
  schema_version: 1,
  runtime_layout: {
    facade_door: { x: 0, z: -9.7, yaw: 0 },
    salon: {
      spawn: { x: 0, z: 6, yaw: 0 },
      exit: { x: 0, z: 7.6 },
      dangg_door: { x: 6.95, z: 3 },
      bounds: { minX: -6.9, maxX: 6.9, minZ: -8.9, maxZ: 6.9 },
      obstacles: [],
    },
  },
};

const PLAZA = {
  glb: "nervix_arrival_square.glb",
  spawn: { x: 19, z: 0.6, yaw: 1.5707963 },
  fountain: { x: 0, z: 0, radius: 3.4, top_y: 2.6 },
  bounds: { minX: -30, maxX: 24, minZ: -14, maxZ: 14 },
  obstacles: [{ minX: -3.4, maxX: 3.4, minZ: -3.4, maxZ: 3.4 }],
  test_builder_door: { x: 7.5, z: 8.2, yaw: -0.3 },
  replaces_chunks: ["nervix_plaza", "nervix_street", "nervix_merchanthouse", "nervix_cafe", "nervix_props"],
  lighting: {
    background: "#f3c9a2",
    fog: { color: "#efc49e", near: 60, far: 190 },
    sun: { position: [-30, 18, 12], color: "#ffcf96", intensity: 2.8 },
    hemisphere: { sky: "#ffe2c0", ground: "#a7795a", intensity: 0.8 },
  },
};

const withPlaza = (plaza: unknown) => ({ ...LEGACY, runtime_layout: { ...LEGACY.runtime_layout, plaza } });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("legacy manifest parses with no plaza and keeps the street spawn and legacy Test Builder door", () => {
  const layout = parseSliceManifest(LEGACY, "m.json");
  assert.equal(layout.plaza, undefined);
  assert.deepEqual(streetSpawn(layout), STREET_SPAWN);
  assert.equal(testBuilderDoor(layout), TEST_BUILDER_DOOR);
  assert.equal(testBuilderDoor(null), TEST_BUILDER_DOOR);
});

test("missing runtime_layout is a readable error", () => {
  assert.throws(() => parseSliceManifest({ schema_version: 1 }, "m.json"), /m\.json has no runtime_layout/);
});

test("plaza is parsed into the runtime layout", () => {
  const layout = parseSliceManifest(withPlaza(PLAZA), "m.json");
  const p = layout.plaza!;
  assert.equal(p.glb, "nervix_arrival_square.glb");
  assert.deepEqual(p.fountain, { x: 0, z: 0, radius: 3.4, topY: 2.6 });
  assert.equal(p.obstacles.length, 1);
  assert.deepEqual(p.replacesChunks, PLAZA.replaces_chunks);
  assert.notEqual(p.replacesChunks, PLAZA.replaces_chunks, "copied, not aliased");
  assert.deepEqual(p.lighting.sun.position, [-30, 18, 12]);
  assert.equal(p.lighting.fog.far, 190);
  // Existing fields stay intact.
  assert.deepEqual(layout.facadeDoor, LEGACY.runtime_layout.facade_door);
  assert.equal(layout.salon.danggDoor.x, 6.95);
});

test("spawn and Test Builder door come from the plaza when present", () => {
  const layout = parseSliceManifest(withPlaza({ ...PLAZA, spawn: { x: 18, z: -1, yaw: 1.6 } }), "m.json");
  assert.deepEqual(streetSpawn(layout), { x: 18, z: -1, yaw: 1.6 });
  const door = testBuilderDoor(layout);
  assert.deepEqual(door.position, [7.5, 0, 8.2]);
  assert.equal(door.yaw, -0.3);
  // Identity never moves with the geometry.
  assert.equal(door.id, "bld_test");
  assert.equal(door.propertyId, "prop_test");
  assert.equal(door.owner, "usr_test");
});

test("leaving the Test Builder house steps back from its plaza threshold along yaw", () => {
  const layout = parseSliceManifest(withPlaza(PLAZA), "m.json");
  const house: Place = { kind: "house", door: testBuilderDoor(layout), from: "plaza" };
  const back = arrival({ kind: "plaza" }, house, layout);
  close(back.x, 7.5 + Math.sin(-0.3) * 2.6);
  close(back.z, 8.2 + Math.cos(-0.3) * 2.6);
  close(back.yaw!, -0.3);
});

test("leaving the Test Builder house without a plaza uses the legacy spot", () => {
  const layout = parseSliceManifest(LEGACY, "m.json");
  const back = arrival({ kind: "plaza" }, { kind: "house", door: TEST_BUILDER_DOOR, from: "plaza" }, layout);
  assert.deepEqual(back, { x: 6, z: 6.8, yaw: 0 });
});

test("leaving DanGG returns in front of the OpenPoker doors", () => {
  const layout = parseSliceManifest(withPlaza(PLAZA), "m.json");
  const dangg: Place = { kind: "house", door: { ...TEST_BUILDER_DOOR, id: "bld_dangg" }, from: "openpoker" };
  const back = arrival({ kind: "plaza" }, dangg, layout);
  close(back.x, 0);
  close(back.z, -9.7 + 2.6);
});

test("malformed plaza fails fast with the offending path", () => {
  const cases: [unknown, RegExp][] = [
    ["nope", /plaza\.\(root\) must be an object/],
    [{ ...PLAZA, glb: "../../etc/passwd" }, /plaza\.glb must be a \.glb file name/],
    [{ ...PLAZA, spawn: { x: 19, z: "0.6", yaw: 1 } }, /plaza\.spawn\.z must be a finite number/],
    [{ ...PLAZA, spawn: { x: 99, z: 0, yaw: 1 } }, /plaza\.spawn is outside bounds/],
    [{ ...PLAZA, spawn: { x: 0, z: 0, yaw: 1 } }, /plaza\.spawn is inside an obstacle/],
    [{ ...PLAZA, fountain: { ...PLAZA.fountain, radius: 0 } }, /plaza\.fountain\.radius must be > 0/],
    [{ ...PLAZA, fountain: { x: 0, z: 0, radius: 3 } }, /plaza\.fountain\.top_y must be a finite number/],
    [{ ...PLAZA, bounds: { minX: 5, maxX: 1, minZ: 0, maxZ: 1 } }, /plaza\.bounds has min greater than max/],
    [{ ...PLAZA, obstacles: [{ minX: 0, maxX: 1, minZ: 0 }] }, /plaza\.obstacles\[0\]\.maxZ must be a finite number/],
    [{ ...PLAZA, test_builder_door: { x: 1, z: 2 } }, /plaza\.test_builder_door\.yaw must be a finite number/],
    [{ ...PLAZA, replaces_chunks: "nervix_plaza" }, /plaza\.replaces_chunks must be an array of chunk ids/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, background: "orange" } }, /plaza\.lighting\.background must be a "#rrggbb" colour/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, fog: { color: "#ffffff", near: 50, far: 10 } } }, /plaza\.lighting\.fog needs 0 <= near < far/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, sun: { ...PLAZA.lighting.sun, position: [1, 2] } } }, /plaza\.lighting\.sun\.position must be \[x, y, z\]/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, hemisphere: { ...PLAZA.lighting.hemisphere, intensity: -1 } } }, /plaza\.lighting\.hemisphere\.intensity must be >= 0/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, sky_gradient: { horizon: "#ffffff", zenith: "lavender" } } }, /plaza\.lighting\.sky_gradient\.zenith must be a "#rrggbb" colour/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, sky_gradient: [] } }, /plaza\.lighting\.sky_gradient must be an object/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, sky_gradient: { horizon: "#ffffff", mid: "pink", zenith: "#ffffff" } } }, /plaza\.lighting\.sky_gradient\.mid must be a "#rrggbb" colour/],
    [{ ...PLAZA, lighting: { ...PLAZA.lighting, fill: { color: "#ffffff", intensity: -0.1 } } }, /plaza\.lighting\.fill\.intensity must be >= 0/],
  ];
  for (const [plaza, message] of cases) {
    assert.throws(() => parseSliceManifest(withPlaza(plaza), "m.json"), message);
  }
});

test("absent plaza (undefined or null) is not an error", () => {
  assert.equal(parsePlaza(undefined, "m.json"), undefined);
  assert.equal(parsePlaza(null, "m.json"), undefined);
});

test("optional sky_gradient stops are parsed; absent stays absent", () => {
  const without = parsePlaza(PLAZA, "test")!;
  assert.equal(without.lighting.skyGradient, undefined);
  const withStops = parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, sky_gradient: { horizon: "#f6c4a0", zenith: "#cfc4d8" } } }, "test")!;
  assert.deepEqual(withStops.lighting.skyGradient, { horizon: "#f6c4a0", zenith: "#cfc4d8" });
});

test("optional sky mid stop and fill light are parsed; absent stays absent", () => {
  const without = parsePlaza(PLAZA, "test")!;
  assert.equal(without.lighting.fill, undefined);
  const lit = parsePlaza(
    { ...PLAZA, lighting: { ...PLAZA.lighting, sky_gradient: { horizon: "#ffc892", mid: "#f2b0b2", zenith: "#8fb2e4" }, fill: { color: "#b9c2e0", intensity: 0.35 } } },
    "test",
  )!;
  assert.deepEqual(lit.lighting.skyGradient, { horizon: "#ffc892", mid: "#f2b0b2", zenith: "#8fb2e4" });
  assert.deepEqual(lit.lighting.fill, { color: "#b9c2e0", intensity: 0.35 });
});
