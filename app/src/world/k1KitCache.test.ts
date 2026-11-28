import test from "node:test";
import assert from "node:assert/strict";
import { createK1KitLoader } from "./k1KitCache.ts";
import { parseK1Kit } from "./locomotionKit.ts";

const MANIFEST = {
  glb: "k1_pedestrian.glb",
  material_slots: { tunic: "M_Tunic" },
  parts: [{ id: "body", node: "Body", category: "base" }],
  presets: [{ id: "teal", parts: [], palette: { tunic: "#2a7f7f" } }],
  clips: [{ name: "walk", speed_mps: 1.4 }],
};

function fakeFetch(responses: Array<() => Promise<unknown>>) {
  const calls: string[] = [];
  const impl = (url: string) => {
    calls.push(url);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return next() as Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  };
  return { calls, impl };
}

const ok = (json: unknown) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });

test("many avatars share one manifest fetch and one parsed kit", async () => {
  const fetch = fakeFetch([ok(MANIFEST)]);
  const load = createK1KitLoader("/kits/k1", fetch.impl, parseK1Kit);
  const kits = await Promise.all(Array.from({ length: 9 }, () => load()));
  assert.equal(fetch.calls.length, 1);
  assert.deepEqual(fetch.calls, ["/kits/k1/manifest.json"]);
  assert.ok(kits.every((k) => k === kits[0]), "every caller gets the same frozen kit");
  assert.equal(kits[0].glb, "k1_pedestrian.glb");
  assert.ok(Object.isFrozen(kits[0]));
});

test("a failed fetch is not cached: the next caller retries", async () => {
  const fetch = fakeFetch([() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) }), ok(MANIFEST)]);
  const load = createK1KitLoader("/kits/k1", fetch.impl, parseK1Kit);
  await assert.rejects(load(), /HTTP 503/);
  const kit = await load();
  assert.equal(kit.presets[0].id, "teal");
  assert.equal(fetch.calls.length, 2);
});

test("an invalid manifest rejects with the validation message and is retried later", async () => {
  const fetch = fakeFetch([ok({ glb: "" }), ok(MANIFEST)]);
  const load = createK1KitLoader("/kits/k1", fetch.impl, parseK1Kit);
  await assert.rejects(load(), /k1 manifest/);
  assert.equal((await load()).glb, "k1_pedestrian.glb");
});
