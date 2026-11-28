// Run from app/: node --test src/scene/postFx.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { ARRIVAL_VIEW_DEFAULT, FPS_GUARD_START, FX_LEVELS, LOW_HOLD_S, WARMUP_S, arrivalView, bloomThreshold, fxPlan, stepFpsGuard, type FpsGuard } from "./postFx.ts";

test("arrival view defaults to ACES and honours manifest overrides", () => {
  assert.deepEqual(arrivalView(), { ...ARRIVAL_VIEW_DEFAULT });
  assert.equal(arrivalView().toneMapping, "aces");
  assert.deepEqual(arrivalView({ toneMapping: "agx" }), { toneMapping: "agx", exposure: ARRIVAL_VIEW_DEFAULT.exposure, look: "punchy" });
  assert.deepEqual(arrivalView({ exposure: 1.3 }), { toneMapping: "aces", exposure: 1.3, look: "none" });
});

test("AgX takes Blender's Punchy look unless the manifest says otherwise; other transforms never do", () => {
  assert.equal(arrivalView({ toneMapping: "agx", exposure: 1.2311 }).look, "punchy");
  assert.equal(arrivalView({ toneMapping: "agx", look: "none" }).look, "none");
  assert.equal(arrivalView({ toneMapping: "aces", look: "punchy" }).look, "none");
});

test("software tier never runs post passes", () => {
  assert.deepEqual(fxPlan("software", 0), { ao: false, aoSamples: 0, bloom: false });
});

test("gpu tier starts at full quality and clamps levels", () => {
  assert.deepEqual(fxPlan("gpu", 0), { ao: true, aoSamples: 16, bloom: true });
  assert.deepEqual(fxPlan("gpu", -3), fxPlan("gpu", 0));
  assert.deepEqual(fxPlan("gpu", 99), FX_LEVELS[FX_LEVELS.length - 1]);
  assert.equal(fxPlan("gpu", 2).ao, false);
  assert.equal(fxPlan("gpu", 2).bloom, true);
});

const run = (g: FpsGuard, fps: number, seconds: number) => {
  let s = g;
  for (let t = 0; t < seconds; t += 1 / fps) s = stepFpsGuard(s, 1 / fps);
  return s;
};

test("a fast GPU stays at full quality", () => {
  assert.equal(run(FPS_GUARD_START, 60, 20).level, 0);
});

test("warm-up hitches never step down", () => {
  assert.equal(run(FPS_GUARD_START, 20, WARMUP_S - 0.2).level, 0);
});

test("sustained low frame rate steps down one level at a time", () => {
  const once = run(FPS_GUARD_START, 35, WARMUP_S + LOW_HOLD_S + 0.6);
  assert.equal(once.level, 1);
  const floor = run(once, 20, 60);
  assert.equal(floor.level, FX_LEVELS.length - 1);
});

test("recovering frame rate never steps back up", () => {
  const low = run(FPS_GUARD_START, 35, WARMUP_S + LOW_HOLD_S + 0.6);
  assert.equal(run(low, 120, 30).level, low.level);
});

test("long frames (tab switch) are ignored and reset the low timer", () => {
  const s = stepFpsGuard({ level: 0, elapsed: 10, fps: 40, lowFor: 1.9 }, 2);
  assert.equal(s.lowFor, 0);
  assert.equal(s.level, 0);
});

test("bloom threshold sits above sunlit diffuse stone", () => {
  const t = bloomThreshold(3.5, 0.83);
  const sunlitStone = (0.85 * 3.5) / Math.PI + 0.85 * 0.83 * 0.5;
  assert.ok(t > sunlitStone, `${t} > ${sunlitStone}`);
  // Exported lantern glass: emissive (1, 0.4, 0.07) x strength 4 has luminance ~2.0 and must bloom.
  const lantern = (0.2126 + 0.7152 * 0.4 + 0.0722 * 0.07) * 4;
  assert.ok(lantern > t, `${lantern} > ${t}`);
  assert.equal(bloomThreshold(0, 0), 1);
});
