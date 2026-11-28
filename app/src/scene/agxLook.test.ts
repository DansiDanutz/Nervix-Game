import { test } from "node:test";
import assert from "node:assert/strict";
import { agxGlsl, agxSrgb8, punchyEv } from "./agxLook.ts";

/**
 * Ground truth: Blender 5.3, view AgX, look "AgX - Punchy", exposure 0, `save_render` of a float
 * ramp 0.18 * 2^EV (8-bit sRGB). Rows: colour multiplier, then [EV, expected r, g, b].
 */
const BLENDER_PUNCHY: ReadonlyArray<[[number, number, number], ReadonlyArray<[number, number, number, number]>]> = [
  [[1, 1, 1], [[-2, 31, 31, 31], [-1, 57, 57, 57], [0, 88, 88, 88], [1, 126, 126, 126], [2, 162, 162, 162], [4, 214, 214, 214]]],
  [[1, 0.35, 0.2], [[-1, 53, 20, 3], [0, 86, 42, 21], [2, 166, 106, 80], [4, 220, 176, 160]]],
];
const TOLERANCE = 6;

test("the Punchy model reproduces Blender's AgX - Punchy ramp", () => {
  for (const [tint, rows] of BLENDER_PUNCHY) {
    for (const [ev, ...want] of rows) {
      const v = 0.18 * 2 ** ev;
      const got = agxSrgb8([v * tint[0], v * tint[1], v * tint[2]], 1, "punchy");
      got.forEach((c, i) => assert.ok(Math.abs(c - want[i]) <= TOLERANCE, `tint ${tint} EV ${ev}: got ${got}, Blender ${want}`));
    }
  }
});

test("Punchy darkens mid-grey by about a third against base AgX, like Blender (118 -> 88)", () => {
  const [base] = agxSrgb8([0.18, 0.18, 0.18], 1, "none");
  const [punchy] = agxSrgb8([0.18, 0.18, 0.18], 1, "punchy");
  assert.ok(base - punchy >= 25 && base - punchy <= 45, `base ${base}, punchy ${punchy}`);
});

test("exposure scales the scene before the view transform", () => {
  const [a] = agxSrgb8([0.09, 0.09, 0.09], 2, "punchy");
  const [b] = agxSrgb8([0.18, 0.18, 0.18], 1, "punchy");
  assert.equal(a, b);
});

test("punchyEv leaves values below the log floor alone and is monotonic", () => {
  assert.equal(punchyEv(-20), -20);
  let last = -Infinity;
  for (let ev = -12; ev <= 12; ev += 0.25) {
    const out = punchyEv(ev);
    assert.ok(out > last, `monotonic at ${ev}`);
    last = out;
  }
});

test("the GLSL switches the look with a define and uses prefixed names", () => {
  assert.match(agxGlsl("punchy"), /#define NERVIX_AGX_PUNCHY 1/);
  assert.match(agxGlsl("none"), /#define NERVIX_AGX_PUNCHY 0/);
  assert.match(agxGlsl("punchy"), /vec3 nervixAgx\( vec3 color \)/);
  assert.doesNotMatch(agxGlsl("punchy"), /NaN|undefined/);
});
