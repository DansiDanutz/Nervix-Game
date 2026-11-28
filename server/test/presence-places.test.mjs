/** C3 pure helpers: place validation, per-place bounds, yaw, sequence and presets. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONTRACT_PLACE_IDS, DEFAULT_PLACE, PRESET_IDS, boundsFor, clampTo, createPlaceValidator,
  defaultPreset, normalizeYaw, presetOrDefault, isNewerSeq,
} from "../src/presence-places.mjs";
import { presenceStoreResolvers } from "../src/presence-resolvers.mjs";

const contract = (name) => JSON.parse(readFileSync(new URL(`../../shared/contracts/${name}.json`, import.meta.url), "utf8"));

test("the place and preset ids mirror the frozen contracts", () => {
  assert.deepEqual([...CONTRACT_PLACE_IDS], contract("place-ids").places.map((p) => p.id));
  assert.deepEqual([...PRESET_IDS], contract("avatar-presets").presets.map((p) => p.id));
  assert.equal(DEFAULT_PLACE, "plaza");
});

test("the validator accepts contract ids and known properties only", async () => {
  const validate = createPlaceValidator({ isKnownProperty: async (id) => id === "prop_extra" });
  for (const id of CONTRACT_PLACE_IDS) assert.equal(await validate(id), id);
  assert.equal(await validate("prop_extra"), "prop_extra");
  for (const bad of ["prop_ghost", "PROP_EXTRA", "prop_", `prop_${"x".repeat(60)}`, "house:bld_dangg", "usr_dangg", "", null, 3, {}]) {
    assert.equal(await validate(bad), null, JSON.stringify(bad));
  }
});

test("the validator never asks the store about a malformed id", async () => {
  const asked = [];
  const validate = createPlaceValidator({ isKnownProperty: async (id) => (asked.push(id), true) });
  await validate("prop_../../etc");
  await validate("venue");
  assert.deepEqual(asked, []);
});

test("a failing store lookup rejects the place and reports the error", async () => {
  const errors = [];
  const validate = createPlaceValidator({ isKnownProperty: async () => { throw new Error("down"); }, onError: (e) => errors.push(e.message) });
  assert.equal(await validate("prop_extra"), null);
  assert.equal(errors.length, 1);
});

test("each place has its own bounds; unknown houses use the room box", () => {
  assert.deepEqual(boundsFor("plaza"), { minX: -42, maxX: 40, minZ: -40, maxZ: 40 });
  assert.deepEqual(boundsFor("openpoker"), { minX: -6.9, maxX: 6.9, minZ: -8.9, maxZ: 6.9 });
  assert.deepEqual(boundsFor("prop_dangg"), { minX: -5.6, maxX: 5.6, minZ: -4.2, maxZ: 4.2 });
  assert.deepEqual(boundsFor("prop_extra"), boundsFor("prop_test"));
  assert.deepEqual(clampTo(boundsFor("prop_dangg"), 9, -9), { x: 5.6, z: -4.2 });
});

test("bounds can be overridden per place", () => {
  const box = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  assert.deepEqual(boundsFor("plaza", { plaza: box }), box);
  assert.deepEqual(boundsFor("openpoker", { plaza: box }), { minX: -6.9, maxX: 6.9, minZ: -8.9, maxZ: 6.9 });
});

test("yaw is normalised and a non-finite yaw keeps the previous one", () => {
  assert.equal(normalizeYaw(0.3, 0), 0.3);
  assert.ok(Math.abs(normalizeYaw(Math.PI * 4 + 0.3, 0) - 0.3) < 1e-9);
  assert.equal(normalizeYaw(-Math.PI, 0), Math.PI);
  assert.equal(normalizeYaw(Number.NaN, 1.1), 1.1);
  assert.equal(normalizeYaw("1", 1.1), 1.1);
});

test("only a strictly newer non-negative integer sequence is accepted", () => {
  assert.equal(isNewerSeq(1, 0), true);
  assert.equal(isNewerSeq(0, 0), false);
  assert.equal(isNewerSeq(3, 4), false);
  assert.equal(isNewerSeq(-1, 0), false);
  assert.equal(isNewerSeq(1.5, 0), false);
  assert.equal(isNewerSeq("5", 0), false);
  assert.equal(isNewerSeq(Number.MAX_SAFE_INTEGER + 2, 0), false);
});

test("the default preset is deterministic per seed and always in the contract", () => {
  const seeds = ["usr_dangg", "usr_test", "usr_visitor", "p_0123456789ab", "p_ba9876543210", ""];
  for (const seed of seeds) {
    assert.ok(PRESET_IDS.includes(defaultPreset(seed)));
    assert.equal(defaultPreset(seed), defaultPreset(seed));
  }
  assert.ok(new Set(seeds.map(defaultPreset)).size > 1, "different seeds spread over the presets");
});

test("a stored preset is kept only when it is a contract id", () => {
  assert.equal(presetOrDefault("terracotta", "usr_x"), "terracotta");
  assert.equal(presetOrDefault("neon", "usr_x"), defaultPreset("usr_x"));
  assert.equal(presetOrDefault({ id: "teal" }, "usr_x"), defaultPreset("usr_x"));
  assert.equal(presetOrDefault(null, "usr_x"), defaultPreset("usr_x"));
});

test("store resolvers: no store means no extra properties and no stored preset", async () => {
  const { isKnownProperty, resolvePreset } = presenceStoreResolvers({ db: { store: null } });
  assert.equal(await isKnownProperty("prop_extra"), false);
  assert.equal(await resolvePreset("usr_dangg"), null);
});

test("store resolvers read properties and the stored preset from the store", async () => {
  const store = {
    getProperty: async (id) => (id === "prop_extra" ? { id, published: true } : null),
    getAvatar: async (userId) => (userId === "usr_dangg" ? { preset: "terracotta", updatedAt: null } : null),
  };
  const { isKnownProperty, resolvePreset } = presenceStoreResolvers({ db: { store } });
  assert.equal(await isKnownProperty("prop_extra"), true);
  assert.equal(await isKnownProperty("prop_ghost"), false);
  assert.equal(await resolvePreset("usr_dangg"), "terracotta");
  assert.equal(await resolvePreset("usr_test"), null, "no row means no stored preset");
  assert.equal(await resolvePreset(null), null, "guests are never looked up");
});

test("store resolvers tolerate a store without the avatar method yet", async () => {
  const { resolvePreset } = presenceStoreResolvers({ db: { store: { getProperty: async () => null } } });
  assert.equal(await resolvePreset("usr_dangg"), null);
});
