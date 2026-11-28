// Run from app/: node --test src/scene/materialGrade.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { ARRIVAL_MATERIAL_GRADE, gradeLinear, type LinearRgb } from "./materialGrade.ts";

/** HSV saturation of a linear colour: enough to compare before/after. */
const sat = ([r, g, b]: LinearRgb) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
const luma = ([r, g, b]: LinearRgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test("gold and plum are saturated without changing their luminance much", () => {
  const gold: LinearRgb = [0.745, 0.434, 0.068];
  const plum: LinearRgb = [0.195, 0.018, 0.06];
  for (const [name, c] of [["ar_gold", gold], ["ar_plum", plum], ["oc_plum_velvet", plum]] as const) {
    const out = gradeLinear(c, ARRIVAL_MATERIAL_GRADE[name]);
    assert.ok(sat(out) > sat(c) || sat(c) > 0.9, `${name} saturation ${sat(out)} vs ${sat(c)}`);
    assert.ok(Math.abs(luma(out) - luma(c)) < 0.05, `${name} luminance ${luma(out)} vs ${luma(c)}`);
    // Hue family kept: the dominant channel stays red.
    assert.equal(out.indexOf(Math.max(...out)), 0);
  }
});

test("paving albedo is lowered and pulled from orange back toward Blender's rose", () => {
  // GPU spawn frame vs blender-arrival-street.png: paving read hue ~21 / S ~0.33 against Cycles ~10 / ~0.21.
  const white: LinearRgb = [1, 1, 1];
  const out = gradeLinear(white, ARRIVAL_MATERIAL_GRADE.ar_cobble);
  assert.ok(luma(out) < 0.95 && luma(out) > 0.85, `paving gain ${luma(out)}`);
  assert.ok(out[2] > out[1] && out[0] < out[1], "blue lifted and red trimmed: hue moves from orange toward rose");
});

test("plum and rose paints get a blue lift so the amber key light does not turn them crimson", () => {
  const plum: LinearRgb = [0.195, 0.018, 0.06];
  const rose: LinearRgb = [0.571, 0.198, 0.209];
  for (const [name, c] of [["ar_plum", plum], ["ar_dome_rose", rose], ["oc_plum_velvet", plum]] as const) {
    const out = gradeLinear(c, ARRIVAL_MATERIAL_GRADE[name]);
    assert.ok(out[2] / out[0] > c[2] / c[0], `${name} blue/red ${out[2] / out[0]} vs ${c[2] / c[0]}`);
  }
  const band = gradeLinear([1, 1, 1], ARRIVAL_MATERIAL_GRADE.ar_plum_band);
  assert.ok(band[2] > band[0], "textured plum band: blue lift over the white factor");
});

test("output is clamped to [0, 1] and the input is not mutated", () => {
  const c: LinearRgb = Object.freeze([0.9, 0.5, 0.01]) as LinearRgb;
  const out = gradeLinear(c, { saturation: 3, value: 1.5 });
  for (const v of out) assert.ok(v >= 0 && v <= 1);
  assert.deepEqual(c, [0.9, 0.5, 0.01]);
});

test("identity grade returns the same colour", () => {
  assert.deepEqual(gradeLinear([0.3, 0.2, 0.1], { saturation: 1, value: 1 }).map((v) => +v.toFixed(6)), [0.3, 0.2, 0.1]);
});

test("only named materials are graded; teal, limestone and plaster are untouched", () => {
  for (const name of ["ar_teal", "ar_limestone", "ar_plaster_warm", "ar_red_carpet"]) assert.equal(ARRIVAL_MATERIAL_GRADE[name], undefined);
});
