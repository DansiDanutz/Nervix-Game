/**
 * C5 appearance data, pure parts: the preset contract matches the K1 kit,
 * input validation, the default preset, and the fixture presets.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRESET_IDS, DEFAULT_PRESET, AvatarError, isPresetId, parseAvatarInput, avatarView } from "../src/avatar.mjs";
import { AVATARS } from "../seed/fixtures/avatars.mjs";
import { USERS } from "../seed/fixtures/users.mjs";

const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const CONTRACT = json("../../shared/contracts/avatar-presets.json");
const KIT = json("../../app/public/kits/k1/manifest.json");

test("the contract lists exactly the K1 kit presets, in kit order", () => {
  assert.deepEqual(CONTRACT.presets.map((p) => p.id), KIT.presets.map((p) => p.id));
  assert.deepEqual([...PRESET_IDS], KIT.presets.map((p) => p.id));
  for (const id of ["burgundy", "linen", "traveller", "sage"]) assert.ok(PRESET_IDS.includes(id), id);
});

test("contract palettes, labels and parts equal the kit's", () => {
  const kit = new Map(KIT.presets.map((p) => [p.id, p]));
  for (const p of CONTRACT.presets) {
    const k = kit.get(p.id);
    assert.equal(p.label, k.label, p.id);
    assert.deepEqual(p.palette, k.palette, p.id);
    assert.deepEqual(p.parts, k.parts, p.id);
  }
});

test("the preset ids are frozen and the default is a contract preset", () => {
  assert.ok(Object.isFrozen(PRESET_IDS));
  assert.equal(DEFAULT_PRESET, "teal");
  assert.ok(isPresetId(DEFAULT_PRESET));
});

test("isPresetId accepts contract ids only", () => {
  assert.equal(isPresetId("sage"), true);
  for (const bad of ["SAGE", "purple", "", null, undefined, 3, {}, ["sage"], "teal "]) assert.equal(isPresetId(bad), false, String(bad));
});

test("parseAvatarInput returns a frozen { preset } for a valid body", () => {
  const out = parseAvatarInput({ preset: "linen" });
  assert.deepEqual(out, { preset: "linen" });
  assert.ok(Object.isFrozen(out));
});

test("parseAvatarInput ignores a client userId: identity is never read from the body", () => {
  assert.deepEqual(parseAvatarInput({ preset: "sage", userId: "usr_dangg" }), { preset: "sage" });
});

test("parseAvatarInput rejects missing, unknown and non-string presets with AvatarError", () => {
  for (const body of [undefined, null, {}, { preset: "purple" }, { preset: 1 }, { preset: "" }, { preset: ["teal"] }, "teal"]) {
    assert.throws(() => parseAvatarInput(body), (e) => e instanceof AvatarError && e.name === "invalid_avatar", JSON.stringify(body));
  }
});

test("parseAvatarInput rejects raw colours: players store a preset id, never a palette", () => {
  assert.throws(() => parseAvatarInput({ preset: "teal", palette: { tunic: "#ff0000" } }), AvatarError);
});

test("avatarView reports the stored preset, or the default when there is no row", () => {
  assert.deepEqual(avatarView(null), { preset: DEFAULT_PRESET, source: "default" });
  assert.deepEqual(avatarView({ preset: "burgundy" }), { preset: "burgundy", source: "saved" });
  // A stored id that left the contract falls back instead of leaking an unknown id.
  assert.deepEqual(avatarView({ preset: "retired" }), { preset: DEFAULT_PRESET, source: "default" });
});

test("every fixture user has a distinct contract preset", () => {
  const users = USERS.map(([id]) => id);
  assert.deepEqual(Object.keys(AVATARS).sort(), [...users].sort());
  const presets = Object.values(AVATARS);
  for (const p of presets) assert.ok(isPresetId(p), p);
  assert.equal(new Set(presets).size, presets.length);
  assert.ok(Object.isFrozen(AVATARS));
});
