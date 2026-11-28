import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Call } from "./http.ts";
import { AVATAR_PRESETS, DEFAULT_PRESET, avatarEndpoints, isAvatarPresetId } from "./avatar.ts";

const load = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
type ContractPreset = { id: string; label: string; palette: Record<string, string> };

test("AVATAR_PRESETS mirrors shared/contracts/avatar-presets.json (ids, labels, palettes)", () => {
  const contract = load("../../../../shared/contracts/avatar-presets.json") as { presets: ContractPreset[] };
  assert.deepEqual(AVATAR_PRESETS.map((p) => [p.id, p.label, p.palette]), contract.presets.map((p) => [p.id, p.label, p.palette]));
});

test("AVATAR_PRESETS ids match the K1 kit manifest presets", () => {
  const kit = load("../../../public/kits/k1/manifest.json") as { presets: { id: string }[] };
  assert.deepEqual(AVATAR_PRESETS.map((p) => p.id), kit.presets.map((p) => p.id));
});

test("presets are frozen and the default is teal", () => {
  assert.ok(Object.isFrozen(AVATAR_PRESETS));
  assert.ok(AVATAR_PRESETS.every((p) => Object.isFrozen(p) && Object.isFrozen(p.palette)));
  assert.equal(DEFAULT_PRESET, "teal");
});

test("isAvatarPresetId accepts contract ids only", () => {
  assert.equal(isAvatarPresetId("sage"), true);
  for (const bad of ["purple", "", null, 1, undefined]) assert.equal(isAvatarPresetId(bad), false);
});

test("avatar endpoints: GET /me/avatar and PUT /me/avatar with the preset only (no userId)", async () => {
  const calls: [string, unknown, string | undefined][] = [];
  const call = (async (path: string, body?: unknown, method?: string) => {
    calls.push([path, body, method]);
    return { preset: "sage", source: "saved" };
  }) as Call;
  const a = avatarEndpoints(call);
  assert.deepEqual(await a.myAvatar(), { preset: "sage", source: "saved" });
  await a.saveAvatar("linen");
  assert.deepEqual(calls, [["/me/avatar", undefined, undefined], ["/me/avatar", { preset: "linen" }, "PUT"]]);
});
