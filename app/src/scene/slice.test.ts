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

test("lighting.view is optional and validated", () => {
  assert.equal(parsePlaza(PLAZA, "test")!.lighting.view, undefined);
  const aces = parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, view: { tone_mapping: "aces", exposure: 1.1 } } }, "test")!;
  assert.deepEqual(aces.lighting.view, { toneMapping: "aces", exposure: 1.1 });
  const agx = parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, view: { tone_mapping: "agx" } } }, "test")!;
  assert.deepEqual(agx.lighting.view, { toneMapping: "agx" });
  const punchy = parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, view: { tone_mapping: "agx", exposure: 1.2311, look: "punchy" } } }, "test")!;
  assert.deepEqual(punchy.lighting.view, { toneMapping: "agx", exposure: 1.2311, look: "punchy" });
  assert.throws(() => parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, view: { tone_mapping: "agx", look: "AgX - Punchy" } } }, "test"), /lighting\.view\.look must be one of none, punchy/);
  assert.throws(() => parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, view: { tone_mapping: "filmic" } } }, "test"), /lighting\.view\.tone_mapping must be one of aces, agx, neutral/);
  assert.throws(() => parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, view: { exposure: 0 } } }, "test"), /lighting\.view\.exposure must be in/);
  assert.throws(() => parsePlaza({ ...PLAZA, lighting: { ...PLAZA.lighting, view: "aces" } }, "test"), /lighting\.view must be an object/);
});

test("the shipped manifest still parses", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(new URL("../../public/slice/manifest.json", import.meta.url), "utf8"));
  const layout = parseSliceManifest(raw, "public/slice/manifest.json");
  assert.ok(layout.plaza, "runtime_layout.plaza");
});

/* ---- B2: runtime_layout.plots and obstacle top_y ---------------------------------------- */

const PLOT = { id: "slot-12", district: "merchant-quarter", sizeClass: "large", door: [15, 0, 3.7], outward: [0, -1], yaw: Math.PI };
const withPlots = (plots: unknown, plaza: unknown = PLAZA) => ({ ...LEGACY, runtime_layout: { ...LEGACY.runtime_layout, plaza, plots } });

test("absent plots stay absent (backward compatible)", () => {
  assert.equal(parseSliceManifest(withPlaza(PLAZA), "m.json").plots, undefined);
  assert.equal(parseSliceManifest(withPlots(null), "m.json").plots, undefined);
});

test("plots convert the manifest arrays to the client SlicePlot shape and are frozen", () => {
  const second = { ...PLOT, id: "slot-13", sizeClass: "small", door: [-10.594, 0, 10.4] };
  const { plots } = parseSliceManifest(withPlots([PLOT, second]), "m.json");
  assert.deepEqual(plots, [
    { id: "slot-12", district: "merchant-quarter", sizeClass: "large", door: { x: 15, z: 3.7, yaw: Math.PI }, outward: { x: 0, z: -1 }, built: true },
    { id: "slot-13", district: "merchant-quarter", sizeClass: "small", door: { x: -10.594, z: 10.4, yaw: Math.PI }, outward: { x: 0, z: -1 }, built: true },
  ]);
  assert.ok(Object.isFrozen(plots) && Object.isFrozen(plots![0]) && Object.isFrozen(plots![0].door));
});

test("a plot is a Blender-modelled facade unless the manifest says built: false", () => {
  const { plots } = parseSliceManifest(withPlots([{ ...PLOT, built: false }]), "m.json");
  assert.equal(plots![0].built, false);
});

test("malformed plots fail fast with the offending path", () => {
  const cases: [unknown, RegExp][] = [
    [{}, /plots must be an array/],
    [["x"], /plots\[0\] must be an object/],
    [[{ ...PLOT, id: "" }], /plots\[0\]\.id must be a plot id/],
    [[{ ...PLOT, id: "slot 12" }], /plots\[0\]\.id must be a plot id/],
    [[PLOT, PLOT], /plots\[1\]\.id duplicates slot-12/],
    [[{ ...PLOT, district: 3 }], /plots\[0\]\.district must be a non-empty string/],
    [[{ ...PLOT, sizeClass: "huge" }], /plots\[0\]\.sizeClass must be one of small, medium, large/],
    [[{ ...PLOT, door: [15, 3.7] }], /plots\[0\]\.door must be \[x, y, z\]/],
    [[{ ...PLOT, door: [15, 0, "3.7"] }], /plots\[0\]\.door\[2\] must be a finite number/],
    [[{ ...PLOT, outward: [0, -2] }], /plots\[0\]\.outward must be a unit vector/],
    [[{ ...PLOT, outward: { x: 0, z: -1 } }], /plots\[0\]\.outward must be \[x, z\]/],
    [[{ ...PLOT, yaw: null }], /plots\[0\]\.yaw must be a finite number/],
    [[{ ...PLOT, built: "yes" }], /plots\[0\]\.built must be a boolean/],
    [[{ ...PLOT, door: [99, 0, 0] }], /plots\[0\]\.door is outside the plaza bounds/],
    [[{ ...PLOT, door: [0, 0, 0] }], /plots\[0\]\.door is inside an obstacle/],
  ];
  for (const [plots, message] of cases) {
    assert.throws(() => parseSliceManifest(withPlots(plots), "m.json"), message);
  }
});

test("obstacle top_y is optional, parsed to topY and validated", () => {
  const plain = parsePlaza(PLAZA, "t")!;
  assert.deepEqual(plain.obstacles[0], { minX: -3.4, maxX: 3.4, minZ: -3.4, maxZ: 3.4 });
  const tall = parsePlaza({ ...PLAZA, obstacles: [{ ...PLAZA.obstacles[0], top_y: 0.9 }] }, "t")!;
  assert.deepEqual(tall.obstacles[0], { minX: -3.4, maxX: 3.4, minZ: -3.4, maxZ: 3.4, topY: 0.9 });
  assert.throws(() => parsePlaza({ ...PLAZA, obstacles: [{ ...PLAZA.obstacles[0], top_y: 0 }] }, "t"), /plaza\.obstacles\[0\]\.top_y must be > 0/);
  assert.throws(() => parsePlaza({ ...PLAZA, obstacles: [{ ...PLAZA.obstacles[0], top_y: "1" }] }, "t"), /plaza\.obstacles\[0\]\.top_y must be a finite number/);
});

test("the shipped manifest's plots and obstacle tops parse", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(new URL("../../public/slice/manifest.json", import.meta.url), "utf8"));
  const layout = parseSliceManifest(raw, "public/slice/manifest.json");
  assert.deepEqual(layout.plots!.map((p) => p.id), ["slot-12", "slot-13", "slot-14", "slot-15", "slot-16", "slot-17", "slot-18"]);
  const p12 = layout.plots![0];
  assert.deepEqual([p12.door.x, p12.door.z], [layout.plaza!.testBuilderDoor.x, layout.plaza!.testBuilderDoor.z], "slot-12 is the Test Builder house");
  assert.ok(layout.plaza!.obstacles.every((b) => b.topY !== undefined));
});

test("leaving any plaza house steps back from its own threshold, whatever its id", () => {
  const layout = parseSliceManifest(withPlaza(PLAZA), "m.json");
  const door = { ...TEST_BUILDER_DOOR, id: "slot-15", position: [-14.781, 0, 10.4] as [number, number, number], yaw: Math.PI };
  const back = arrival({ kind: "plaza" }, { kind: "house", door, from: "plaza" }, layout);
  close(back.x, -14.781);
  close(back.z, 10.4 - 2.6);
  close(back.yaw!, Math.PI);
});
