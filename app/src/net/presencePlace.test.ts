import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  presencePlaceId, joinPlaceMessage, placeMessage, moveMessage, createSequence, forPlace, snapshotFor, applyRoomFrame, DEFAULT_PRESENCE_PLACE,
  isPlaceRefusal, placeChangeFrame,
} from "./presencePlace.ts";
import { INITIAL_PLAYER, createPlayerState } from "../player/playerState.ts";

const contractIds = (JSON.parse(readFileSync(new URL("../../../shared/contracts/place-ids.json", import.meta.url), "utf8")) as {
  places: { id: string }[];
}).places.map((p) => p.id);

test("contract place ids and well-formed property ids pass; anything else is no room (fail closed)", () => {
  for (const id of contractIds) assert.equal(presencePlaceId(id), id);
  assert.equal(presencePlaceId("prop_newshop"), "prop_newshop");
  for (const bad of ["house:bld_dangg", "venue", "PROP_X", "prop_Dangg", "prop-dangg", "prop_", "usr_dangg", ""]) {
    assert.equal(presencePlaceId(bad), null, bad);
  }
  assert.equal(DEFAULT_PRESENCE_PLACE, "plaza");
});

test("the join frame carries the place and never an identity", () => {
  const msg = joinPlaceMessage("central-plaza", "prop_dangg");
  assert.deepEqual(msg, { type: "join", district: "central-plaza", place: "prop_dangg" });
  assert.doesNotMatch(JSON.stringify(msg), /usr_|demo_|userId|name/);
});

test("a place-change frame carries only the place", () => {
  assert.deepEqual(placeMessage("openpoker"), { type: "place", place: "openpoker" });
});

test("a move frame carries rounded position, yaw, sequence and the sender's place", () => {
  const msg = moveMessage({ x: 1.23456, z: -7.891, yaw: 1.234567 }, 7, "plaza");
  assert.deepEqual(msg, { type: "move", x: 1.23, z: -7.89, yaw: 1.235, seq: 7, place: "plaza" });
});

test("a move frame reads yaw from playerState", () => {
  const state = createPlayerState();
  state.publish({ x: 2, z: 3, yaw: 0.75, tMs: 10 });
  const msg = moveMessage({ x: 2, z: 3, yaw: state.ref.current.yaw }, 1, "plaza");
  assert.equal(msg.yaw, 0.75);
  assert.equal(moveMessage({ x: 0, z: 0, yaw: INITIAL_PLAYER.yaw }, 1, "plaza").yaw, 0);
});

test("a non-finite yaw is sent as 0, never NaN", () => {
  assert.equal(moveMessage({ x: 0, z: 0, yaw: Number.NaN }, 1, "plaza").yaw, 0);
});

test("the sequence starts at 1 and only grows", () => {
  const next = createSequence();
  assert.deepEqual([next(), next(), next()], [1, 2, 3]);
  const other = createSequence();
  assert.equal(other(), 1, "each socket has its own sequence");
});

test("forPlace keeps only players in the given place", () => {
  const players = [
    { id: "p_a", name: "A", district: "d", place: "plaza", preset: "teal", x: 0, z: 0, yaw: 0, seq: 1 },
    { id: "p_b", name: "B", district: "d", place: "prop_dangg", preset: "teal", x: 0, z: 0, yaw: 0, seq: 1 },
  ];
  assert.deepEqual(forPlace(players, "plaza").map((p) => p.id), ["p_a"]);
});

test("a snapshot for another place is ignored; a legacy frame without a place is filtered", () => {
  const a = { id: "p_a", name: "A", district: "d", place: "plaza", preset: "teal", x: 0, z: 0, yaw: 0, seq: 1 };
  const b = { ...a, id: "p_b", place: "openpoker" };
  assert.equal(snapshotFor({ type: "players", place: "openpoker", players: [b] }, "plaza"), null);
  assert.deepEqual(snapshotFor({ type: "players", place: "plaza", players: [a] }, "plaza")?.map((p) => p.id), ["p_a"]);
  assert.deepEqual(snapshotFor({ type: "players", players: [a, b] }, "plaza")?.map((p) => p.id), ["p_a"]);
  assert.deepEqual(snapshotFor({ type: "players" }, "plaza"), []);
});

const player = (id: string, x = 0, place = "plaza") => ({ id, name: id, district: "d", place, preset: "teal", x, z: 0, yaw: 0, seq: 0 });

test("a delta upserts changed players and removes the ones that left (C4)", () => {
  const room = [player("p_a"), player("p_b"), player("p_c")];
  const next = applyRoomFrame(room, { type: "delta", place: "plaza", players: [player("p_b", 5), player("p_d")], left: ["p_c"] }, "plaza");
  assert.deepEqual(next?.map((p) => [p.id, p.x]), [["p_a", 0], ["p_b", 5], ["p_d", 0]]);
  assert.deepEqual(room.map((p) => p.id), ["p_a", "p_b", "p_c"], "the old room is not mutated");
});

test("a delta for another place, or an unknown frame, leaves the room alone", () => {
  const room = [player("p_a")];
  assert.equal(applyRoomFrame(room, { type: "delta", place: "openpoker", players: [player("p_x", 0, "openpoker")], left: [] }, "plaza"), null);
  assert.equal(applyRoomFrame(room, { type: "emote" }, "plaza"), null);
});

test("welcome and players frames replace the room", () => {
  const next = applyRoomFrame([player("p_old")], { type: "players", place: "plaza", players: [player("p_a")] }, "plaza");
  assert.deepEqual(next?.map((p) => p.id), ["p_a"]);
  assert.equal(applyRoomFrame([], { type: "players", place: "openpoker", players: [] }, "plaza"), null);
});

test("a delta never admits a player stamped with another place", () => {
  const next = applyRoomFrame([], { type: "delta", place: "plaza", players: [player("p_x", 0, "openpoker")], left: [] }, "plaza");
  assert.deepEqual(next, []);
});

test("after a place change, players left over from the old room are dropped on the first delta", () => {
  const oldRoom = [player("p_old", 0, "plaza")];
  const next = applyRoomFrame(oldRoom, { type: "delta", place: "prop_dangg", players: [player("p_a", 0, "prop_dangg")], left: [] }, "prop_dangg");
  assert.deepEqual(next?.map((p) => p.id), ["p_a"]);
});

const visitor = (id: string, place: string) => ({ id, name: "Guest", district: "central-plaza", place, preset: "teal", x: 0, z: 0, yaw: 0, seq: 0 });

test("a server refusal of this place empties the room instead of keeping a stale one", () => {
  const room = [visitor("p_a", "prop_demo_lantern")];
  const refused = { type: "error", message: "unknown place", place: "prop_demo_lantern" };
  assert.equal(isPlaceRefusal(refused, "prop_demo_lantern"), true);
  assert.deepEqual(applyRoomFrame(room, refused, "prop_demo_lantern"), []);
  for (const frame of [
    { type: "error", message: "invalid message" },
    { type: "error", message: "unknown place", place: null },
    { type: "error", message: "unknown place", place: "openpoker" },
  ]) {
    assert.equal(isPlaceRefusal(frame, "prop_demo_lantern"), false, JSON.stringify(frame));
    assert.equal(applyRoomFrame(room, frame, "prop_demo_lantern"), null, "other errors change nothing");
  }
  assert.equal(isPlaceRefusal({ type: "error", message: "room full", place: "openpoker" }, "openpoker"), true);
  assert.equal(isPlaceRefusal({ type: "error", message: "rate limited", place: "plaza" }, "plaza"), true);
});

test("with no room (malformed place) no frame ever fills the room", () => {
  const snapshot = { type: "players", place: "plaza", players: [visitor("p_b", "plaza")] };
  assert.equal(applyRoomFrame([], snapshot, null), null);
  assert.equal(applyRoomFrame([], { type: "delta", place: "plaza", players: [visitor("p_b", "plaza")] }, null), null);
});

test("a place change sends place to a joined socket and join to one the server refused", () => {
  assert.deepEqual(placeChangeFrame(true, "central-plaza", "openpoker"), { type: "place", place: "openpoker" });
  assert.deepEqual(placeChangeFrame(false, "central-plaza", "openpoker"), { type: "join", district: "central-plaza", place: "openpoker" });
  assert.deepEqual(placeChangeFrame(true, "central-plaza", null), { type: "place", place: null }, "leaving to no room parks the player");
  assert.equal(placeChangeFrame(false, "central-plaza", null), null, "not joined and no room: send nothing");
});
