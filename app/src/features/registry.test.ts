import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry, featuresIn, register, type Feature } from "./registry.ts";

type Ctx = { name: string };
const feature = (id: string, order: number, slot: "side" | "overlay" = "side"): Feature<Ctx, string> => ({
  id, slot, order, render: (ctx) => `${id}:${ctx.name}`,
});

test("an empty registry has no features in any slot", () => {
  assert.deepEqual(featuresIn(createRegistry<Ctx, string>(), "side"), []);
});

test("register returns a new registry and leaves the old one unchanged", () => {
  const empty = createRegistry<Ctx, string>();
  const one = register(empty, feature("a", 1));
  assert.notEqual(one, empty);
  assert.equal(featuresIn(empty, "side").length, 0);
  assert.equal(featuresIn(one, "side").length, 1);
  assert.equal(Object.isFrozen(one), true);
});

test("features come back in order within their slot, ties by registration", () => {
  const reg = [feature("c", 30), feature("a", 10), feature("o", 5, "overlay"), feature("b", 10)].reduce(register, createRegistry<Ctx, string>());
  assert.deepEqual(featuresIn(reg, "side").map((f) => f.id), ["a", "b", "c"]);
  assert.deepEqual(featuresIn(reg, "overlay").map((f) => f.id), ["o"]);
});

test("registering a duplicate id throws", () => {
  const reg = register(createRegistry<Ctx, string>(), feature("a", 1));
  assert.throws(() => register(reg, feature("a", 2)), /duplicate feature id: a/);
});

test("an invalid id or order is rejected", () => {
  assert.throws(() => register(createRegistry<Ctx, string>(), feature("", 1)), /invalid feature id/);
  assert.throws(() => register(createRegistry<Ctx, string>(), feature("x", Number.NaN)), /invalid feature order/);
});
