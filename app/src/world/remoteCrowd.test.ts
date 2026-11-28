import test from "node:test";
import assert from "node:assert/strict";
import {
  CROWD_LIMITS, INTERP_MS, SNAP_DISTANCE, bodyYaw, contactShadowEntries, emptyCrowd, ingestPlayers, lerpAngle, planCrowd, poseAt, wrapAngle,
  type CrowdPlan, type CrowdTrack, type RemoteSample,
} from "./remoteCrowd.ts";

const player = (id: string, x: number, z: number, extra: Partial<RemoteSample> = {}): RemoteSample => ({
  id, name: `P ${id}`, place: "plaza", preset: "teal", x, z, yaw: 0, ...extra,
});

const close = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≈ ${expected}`);

test("wrapAngle folds any angle into (-π, π]", () => {
  close(wrapAngle(0), 0);
  close(wrapAngle(Math.PI * 3), Math.PI);
  close(wrapAngle(-Math.PI), Math.PI);
  close(wrapAngle(Math.PI * 2 + 0.5), 0.5);
  close(wrapAngle(-Math.PI * 2 - 0.5), -0.5);
});

test("lerpAngle takes the shortest arc, also across ±π", () => {
  close(lerpAngle(0, 1, 0.5), 0.5);
  // 170° to -170° is 20° through 180°, not 340° back through 0.
  const a = (170 * Math.PI) / 180;
  const b = (-170 * Math.PI) / 180;
  close(Math.abs(lerpAngle(a, b, 0.5)), Math.PI);
  close(lerpAngle(a, b, 0.25), wrapAngle((175 * Math.PI) / 180));
  close(lerpAngle(a, b, 0), a);
  close(lerpAngle(a, b, 1), b);
});

test("a new player starts snapped at its sample, no tween from the origin", () => {
  const crowd = ingestPlayers(emptyCrowd(), [player("a", 4, -2, { yaw: 1 })], 1000);
  const pose = poseAt(crowd.get("a")!, 1000);
  assert.deepEqual(pose, { x: 4, z: -2, bodyYaw: bodyYaw(1) });
});

test("a new sample tweens from the shown pose to the new sample over one tick", () => {
  const t0 = 1000;
  const start = ingestPlayers(emptyCrowd(), [player("a", 0, 0)], t0);
  const moved = ingestPlayers(start, [player("a", 1, 0, { yaw: 1 })], t0);
  const track = moved.get("a")!;
  close(poseAt(track, t0).x, 0);
  close(poseAt(track, t0 + INTERP_MS / 2).x, 0.5);
  close(poseAt(track, t0 + INTERP_MS / 2).bodyYaw, bodyYaw(0.5));
  assert.deepEqual(poseAt(track, t0 + INTERP_MS * 3), { x: 1, z: 0, bodyYaw: bodyYaw(1) });
});

test("a sample arriving mid-tween continues from where the avatar is drawn (no jump back)", () => {
  const t0 = 0;
  let crowd = ingestPlayers(emptyCrowd(), [player("a", 0, 0)], t0);
  crowd = ingestPlayers(crowd, [player("a", 1, 0, {})], t0);
  const mid = t0 + INTERP_MS / 2;
  crowd = ingestPlayers(crowd, [player("a", 2, 0, {})], mid);
  close(poseAt(crowd.get("a")!, mid).x, 0.5);
  close(poseAt(crowd.get("a")!, mid + INTERP_MS).x, 2);
});

test("an unchanged sample keeps the same track object (no needless allocation)", () => {
  const crowd = ingestPlayers(emptyCrowd(), [player("a", 1, 1)], 0);
  const again = ingestPlayers(crowd, [player("a", 1, 1)], 50);
  assert.equal(again.get("a"), crowd.get("a"));
});

test("a name or preset change without a move updates the track but keeps its motion", () => {
  const crowd = ingestPlayers(emptyCrowd(), [player("a", 1, 1)], 0);
  const renamed = ingestPlayers(crowd, [player("a", 1, 1, { name: "Ana", preset: "sage" })], 50);
  const track = renamed.get("a")!;
  assert.equal(track.name, "Ana");
  assert.equal(track.preset, "sage");
  assert.equal(track.start, crowd.get("a")!.start);
});

test("samples as presence sends them (no seq, PUBLIC_FIELDS only) tween, hold and snap", () => {
  // server/src/presence-privacy.mjs PUBLIC_FIELDS: id, name, preset, place, x, z, yaw. Order is the socket's.
  const wire = (x: number, z: number) => ({ id: "a", name: "Ana", preset: "teal", place: "plaza", x, z, yaw: 0 });
  let crowd = ingestPlayers(emptyCrowd(), [wire(0, 0)], 0);
  crowd = ingestPlayers(crowd, [wire(1, 0)], 0);
  close(poseAt(crowd.get("a")!, INTERP_MS / 2).x, 0.5);
  const held = ingestPlayers(crowd, [wire(1, 0)], INTERP_MS / 2);
  assert.equal(held.get("a"), crowd.get("a"), "a repeated pose keeps the tween running");
  const jumped = ingestPlayers(held, [wire(1 + SNAP_DISTANCE + 1, 0)], INTERP_MS);
  close(poseAt(jumped.get("a")!, INTERP_MS).x, 1 + SNAP_DISTANCE + 1);
  assert.equal("seq" in jumped.get("a")!, false);
});

test("facing: presence yaw is the look yaw (forward = (-sin, -cos)); the body turns to face it", () => {
  // The crowd figure looks along its local +z; rotation.y = θ sends +z to (sin θ, cos θ).
  const facing = (look: number) => {
    const crowd = ingestPlayers(emptyCrowd(), [player("a", 0, 0, { yaw: look })], 0);
    const b = poseAt(crowd.get("a")!, 0).bodyYaw;
    return { x: Math.sin(b), z: Math.cos(b) };
  };
  const zero = facing(0);
  close(zero.x, 0);
  close(zero.z, -1); // yaw 0 looks toward -z, so the body faces -z
  for (const look of [0.3, 1.2, -2.5, Math.PI]) {
    const f = facing(look);
    close(f.x, -Math.sin(look));
    close(f.z, -Math.cos(look));
  }
  close(bodyYaw(0), Math.PI);
  close(bodyYaw(Math.PI / 2), -Math.PI / 2);
});

test("a long jump (teleport, door) snaps instead of sliding across the square", () => {
  let crowd = ingestPlayers(emptyCrowd(), [player("a", 0, 0)], 0);
  crowd = ingestPlayers(crowd, [player("a", SNAP_DISTANCE + 1, 0, {})], 0);
  close(poseAt(crowd.get("a")!, 0).x, SNAP_DISTANCE + 1);
});

test("a place change snaps", () => {
  let crowd = ingestPlayers(emptyCrowd(), [player("a", 0, 0)], 0);
  crowd = ingestPlayers(crowd, [player("a", 1, 0, { place: "openpoker" })], 0);
  close(poseAt(crowd.get("a")!, 0).x, 1);
});

test("players who left are dropped and the input map is never mutated", () => {
  const crowd = ingestPlayers(emptyCrowd(), [player("a", 0, 0), player("b", 1, 1)], 0);
  const next = ingestPlayers(crowd, [player("b", 1, 1)], 10);
  assert.deepEqual([...next.keys()], ["b"]);
  assert.deepEqual([...crowd.keys()], ["a", "b"]);
  assert.ok(Object.isFrozen(next.get("b")));
});

test("non-finite samples are ignored rather than drawn at NaN", () => {
  const crowd = ingestPlayers(emptyCrowd(), [player("a", Number.NaN, 0), player("b", 0, Infinity)], 0);
  assert.equal(crowd.size, 0);
});

// ---- LOD ----

/** n players in a line along +x, 1 m apart, starting 1 m from the camera at the origin. */
function line(n: number, step = 1): Map<string, CrowdTrack> {
  const players = Array.from({ length: n }, (_, i) => player(`p${i}`, (i + 1) * step, 0));
  return ingestPlayers(emptyCrowd(), players, 0);
}
const cam = { x: 0, z: 0 };
const byId = (plan: CrowdPlan) => new Map(plan.map((e) => [e.id, e]));

test("the plan is sorted near to far with distances", () => {
  const plan = planCrowd(line(3, 2), 0, cam);
  assert.deepEqual(plan.map((e) => e.id), ["p0", "p1", "p2"]);
  assert.deepEqual(plan.map((e) => e.distance), [2, 4, 6]);
});

test("full detail is capped at the nearest 30; the rest are impostors", () => {
  const plan = planCrowd(line(40, 0.5), 0, cam);
  const full = plan.filter((e) => e.tier === "full");
  assert.equal(full.length, CROWD_LIMITS.fullCap);
  assert.equal(CROWD_LIMITS.fullCap, 30);
  assert.deepEqual(full.map((e) => e.id), plan.slice(0, 30).map((e) => e.id));
  assert.ok(plan.slice(30).every((e) => e.tier === "impostor"));
});

test("beyond the impostor distance everyone is an impostor, even with room in the cap", () => {
  const plan = byId(planCrowd(line(40), 0, cam));
  assert.equal(plan.get("p23")!.tier, "full"); // 24 m
  assert.equal(plan.get("p25")!.tier, "impostor"); // 26 m
  assert.equal(CROWD_LIMITS.impostorDistance, 25);
});

test("labels show only within ~15 m and only on full-detail avatars", () => {
  const edge = ingestPlayers(emptyCrowd(), [player("in", 15, 0), player("out", 0, 16)], 0);
  const plan = byId(planCrowd(edge, 0, cam));
  assert.equal(plan.get("in")!.label, true); // 15 m
  assert.equal(plan.get("out")!.label, false); // 16 m
  assert.equal(plan.get("out")!.tier, "full");
  assert.equal(CROWD_LIMITS.labelDistance, 15);
  const far = planCrowd(line(40, 0.5), 0, cam).filter((e) => e.tier === "impostor");
  assert.ok(far.every((e) => !e.label));
});

test("labels are capped so a packed square stays readable", () => {
  const plan = planCrowd(line(30, 0.2), 0, cam);
  assert.equal(plan.filter((e) => e.label).length, CROWD_LIMITS.labelCap);
});

test("only near full-detail avatars cast shadows, capped", () => {
  const plan = planCrowd(line(30, 0.25), 0, cam);
  const shadows = plan.filter((e) => e.shadow);
  assert.equal(shadows.length, CROWD_LIMITS.shadowCap);
  assert.ok(shadows.every((e) => e.tier === "full" && e.distance <= CROWD_LIMITS.shadowDistance));
  const spread = byId(planCrowd(line(20), 0, cam));
  assert.equal(spread.get("p0")!.shadow, true);
  assert.equal(spread.get(`p${CROWD_LIMITS.shadowDistance}`)!.shadow, false);
});

test("hysteresis: an avatar at the edge keeps its tier and label instead of flickering", () => {
  const edge = ingestPlayers(emptyCrowd(), [player("a", CROWD_LIMITS.impostorDistance + 0.4, 0)], 0);
  const wasFull = planCrowd(edge, 0, cam, [{ id: "a", tier: "full", label: true, shadow: false, distance: 24.9, x: 0, z: 0, bodyYaw: 0, preset: "teal", name: "" }]);
  assert.equal(wasFull[0].tier, "full");
  const fresh = planCrowd(edge, 0, cam);
  assert.equal(fresh[0].tier, "impostor");
  const nearLabel = ingestPlayers(emptyCrowd(), [player("a", CROWD_LIMITS.labelDistance + 0.4, 0)], 0);
  assert.equal(planCrowd(nearLabel, 0, cam)[0].label, false);
  assert.equal(planCrowd(nearLabel, 0, cam, [{ ...wasFull[0], label: true }])[0].label, true);
});

test("plan entries carry the interpolated pose, preset and name for drawing", () => {
  let crowd = ingestPlayers(emptyCrowd(), [player("a", 0, 0, { preset: "sage", name: "Ana" })], 0);
  crowd = ingestPlayers(crowd, [player("a", 2, 0, { preset: "sage", name: "Ana" })], 0);
  const [entry] = planCrowd(crowd, INTERP_MS / 2, { x: 10, z: 0 });
  close(entry.x, 1);
  close(entry.distance, 9);
  assert.equal(entry.preset, "sage");
  assert.equal(entry.name, "Ana");
  assert.ok(Object.isFrozen(entry));
});

test("every full-detail remote player (near and mid) lays a contact shadow on the baked square; impostors do not", () => {
  // 40 players 0.8 m apart: the nearest fullCap are full detail, the rest impostors.
  const plan = planCrowd(line(40, 0.8), 0, cam);
  const shadowed = contactShadowEntries(plan);
  assert.equal(shadowed.length, CROWD_LIMITS.fullCap);
  assert.ok(shadowed.every((e) => e.tier === "full"));
  assert.ok(shadowed.some((e) => !e.shadow), "mid-tier figures (no shadow-map caster) are included");
  assert.deepEqual(shadowed.map((e) => e.id), plan.filter((e) => e.tier === "full").map((e) => e.id));
  assert.ok(Object.isFrozen(shadowed));
  assert.deepEqual(contactShadowEntries([]), []);
});
