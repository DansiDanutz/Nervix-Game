import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ACCENT } from "../net/api/world.ts";
import {
  FALLBACK_SIGN_NAME,
  SIGN_DEFAULT_ACCENT,
  SIGN_MAX_CHARS,
  paintSignboard,
  safeSignText,
  signboardSpec,
  type SignCanvas,
} from "./signboard.ts";

const record = (over: Partial<{ merchantName: string; accent: string; verified: boolean }> = {}) =>
  Object.freeze({ merchantName: "Lantern Books", accent: "#c98b3a", verified: true, ...over });

test("the spec carries the name, the accent and a visible verified seal", () => {
  const spec = signboardSpec(record());
  assert.equal(spec.text.value, "Lantern Books");
  assert.equal(spec.background, "#c98b3a");
  assert.ok(spec.seal);
  assert.equal(spec.seal.label, "verified");
});

test("an unverified record gets no seal", () => {
  assert.equal(signboardSpec(record({ verified: false })).seal, null);
});

test("a malformed accent falls back to the world directory default", () => {
  assert.equal(SIGN_DEFAULT_ACCENT, DEFAULT_ACCENT);
  for (const accent of ["red", "#fff", "#12345g", "url(x)", ""]) {
    assert.equal(signboardSpec(record({ accent })).background, DEFAULT_ACCENT, accent);
  }
});

test("text colour contrasts with the accent", () => {
  assert.equal(signboardSpec(record({ accent: "#101010" })).text.colour, "#f6efe0");
  assert.equal(signboardSpec(record({ accent: "#f0f0f0" })).text.colour, "#1d1a16");
});

test("long names are truncated with an ellipsis and shrink the font", () => {
  const long = "Copper Kettle Tea and Spice Emporium of the Merchant Quarter";
  const spec = signboardSpec(record({ merchantName: long }));
  const chars = Array.from(spec.text.value);
  assert.equal(chars.length, SIGN_MAX_CHARS);
  assert.equal(chars.at(-1), "…");
  assert.ok(spec.text.size < signboardSpec(record({ merchantName: "Atlas" })).text.size);
});

test("truncation counts code points, so an emoji is never split", () => {
  const name = "😀".repeat(SIGN_MAX_CHARS + 4);
  const value = signboardSpec(record({ merchantName: name })).text.value;
  assert.ok(!/[\uD800-\uDBFF]$/.test(value.slice(0, -1)), "no lone high surrogate before the ellipsis");
  assert.equal(Array.from(value).length, SIGN_MAX_CHARS);
});

test("safe text strips control, bidi-override and zero-width characters and collapses spaces", () => {
  assert.equal(safeSignText("  Juniper\u0000‮ Florist​\n\t "), "Juniper Florist");
  assert.equal(safeSignText("<b>Atlas</b>"), "<b>Atlas</b>", "canvas text is not HTML; it is drawn literally");
});

test("an empty or non-string name falls back to a neutral label", () => {
  assert.equal(signboardSpec(record({ merchantName: "​  \u0007" })).text.value, FALLBACK_SIGN_NAME);
  assert.equal(signboardSpec({ merchantName: undefined as unknown as string, accent: "#123456", verified: true }).text.value, FALLBACK_SIGN_NAME);
});

test("canvas size follows the sign anchor aspect", () => {
  const spec = signboardSpec(record(), { size: [2.0, 0.5] });
  assert.equal(spec.width, 512);
  assert.equal(spec.height, 128);
  const fallback = signboardSpec(record(), { size: [0, -1] });
  assert.ok(fallback.height > 0 && fallback.height <= fallback.width);
});

test("the spec is frozen and the input is not mutated", () => {
  const input = { merchantName: "  Atlas  ", accent: "#3f6f8f", verified: true };
  const spec = signboardSpec(input);
  assert.ok(Object.isFrozen(spec) && Object.isFrozen(spec.text));
  assert.equal(input.merchantName, "  Atlas  ");
});

function fakeCanvas(): { canvas: SignCanvas; calls: string[] } {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) => (...args: unknown[]) => calls.push(`${key}:${JSON.stringify(args)}`),
    set: (_t, key: string, value) => (calls.push(`${key}=${String(value)}`), true),
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx as never }, calls };
}

test("paintSignboard sizes the canvas and draws the name and seal", () => {
  const { canvas, calls } = fakeCanvas();
  const spec = signboardSpec(record());
  assert.equal(paintSignboard(canvas, spec), true);
  assert.equal(canvas.width, spec.width);
  assert.equal(canvas.height, spec.height);
  assert.ok(calls.some((c) => c.startsWith("fillText:") && c.includes("Lantern Books")));
  assert.ok(calls.some((c) => c.startsWith("arc:")), "seal drawn");
});

test("paintSignboard without a seal draws no arc; without a 2d context it reports false", () => {
  const { canvas, calls } = fakeCanvas();
  paintSignboard(canvas, signboardSpec(record({ verified: false })));
  assert.ok(!calls.some((c) => c.startsWith("arc:")));
  assert.equal(paintSignboard({ width: 0, height: 0, getContext: () => null }, signboardSpec(record())), false);
});
