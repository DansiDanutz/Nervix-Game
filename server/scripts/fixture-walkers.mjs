#!/usr/bin/env node
/**
 * C8 fixture walkers: a DEMO-only service that walks the seeded fixture walkers
 * (seed/fixtures/walkers.mjs) around the plaza over the presence socket, so the
 * square is never empty in a demo. Local use only.
 *
 *   NERVIX_WORLD_SLICE=1 node scripts/fixture-walkers.mjs --port 28797 [--count 6] [--seconds 60] [--hz 5] [--seed 1]
 *
 * Seed the walkers first (opt-in, not part of seed/slice-fixtures.mjs), from server/:
 *
 *   DATABASE_URL=postgres:///nervix_world NERVIX_WORLD_SLICE=1 node seed/walker-fixtures.mjs
 *
 * Refuses, before any socket opens, unless NERVIX_WORLD_SLICE is explicitly on,
 * payments are not live, NODE_ENV is not production and the API's /health on
 * 127.0.0.1:<port> reports demo mode.
 *
 * Limitation: the slice, live-payments and production checks read THIS process's
 * environment, not the server's. /health only reports `demo`, which is the
 * hard-coded DEMO_MODE constant in src/nervixpay.demo.mjs, so a server started
 * with NERVIXPAY_MODE=live or NODE_ENV=production still passes `not_demo` when
 * the walker shell lacks those variables. Run the walkers from the same shell
 * environment as the server. Closing this needs /health (server-lane file) to
 * report the server's own payment mode, NODE_ENV and slice flag. It connects only to loopback and only as
 * the listed fixture walkers, through their fixture session cookies: there is
 * no option to pass a session, user, host or URL. A walker whose session the
 * server does not recognise (it would be admitted as a guest) stops the run.
 * Peer ports 8787 and 18787 are refused. Walkers wander between random points
 * inside the slice manifest's plaza bounds, off the fountain and obstacles.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import WebSocket from "ws";

import { WALKERS, isFixtureWalker } from "../seed/fixtures/walkers.mjs";
import { DEFAULT_PLACE_BOUNDS } from "../src/presence-places.mjs";

export const WALKER_HOST = "127.0.0.1";
export const PEER_PORTS = Object.freeze([8787, 18787]);
/** Matches the K1 walk clip's authored speed, so remote walkers animate at a natural pace. */
export const WALK_SPEED_MPS = 1.4;
const SLICE_ON_VALUES = Object.freeze(["1", "true", "on"]);
const DEFAULTS = Object.freeze({ count: 6, seconds: 0, hz: 5, seed: 1 });
const MAX_HZ = 10;
const EDGE_MARGIN_M = 1.5;
const OBSTACLE_MARGIN_M = 0.6;
const FOUNTAIN_MARGIN_M = 1.0;
const PATH_SAMPLE_M = 0.4;
const MIN_LEG_M = 3;
const TARGET_TRIES = 30;
const START_TRIES = 500;
const PAUSE_MIN_S = 1;
const PAUSE_SPAN_S = 3;
const JOIN_TIMEOUT_MS = 10_000;
const MANIFEST_URL = new URL("../../app/public/slice/manifest.json", import.meta.url);

export class WalkerRefusal extends Error {
  constructor(reason) {
    super(`fixture walkers refused: ${reason}`);
    this.reason = reason;
  }
}

/** The reason the environment alone forbids walkers, or null. */
export function envRefusal(env = {}) {
  if (!SLICE_ON_VALUES.includes(String(env.NERVIX_WORLD_SLICE ?? "").trim().toLowerCase())) return "slice_off";
  if (String(env.NERVIXPAY_MODE ?? "").trim().toLowerCase() === "live") return "live_payments";
  if (env.NODE_ENV === "production") return "production";
  return null;
}

/** Why walkers may not run against a server with this /health body, or null when they may. */
export function walkerRefusal(env, health) {
  return envRefusal(env) ?? (health?.demo === true ? null : "not_demo");
}

const intArg = (value, flag, lo, hi) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${flag} must be an integer ${lo}..${hi}`);
  return n;
};

const FLAGS = Object.freeze({
  "--port": (v) => intArg(v, "--port", 1, 65535),
  "--count": (v) => intArg(v, "--count", 1, WALKERS.length),
  "--seconds": (v) => intArg(v, "--seconds", 0, 86_400),
  "--hz": (v) => intArg(v, "--hz", 1, MAX_HZ),
  "--seed": (v) => intArg(v, "--seed", 0, 2 ** 31),
});

export function parseWalkerArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    const parse = FLAGS[argv[i]];
    if (!parse) throw new Error(`unknown option ${argv[i]}`);
    parsed[argv[i].slice(2)] = parse(argv[i + 1]);
  }
  if (parsed.port === undefined) throw new Error("--port <API port> is required");
  if (PEER_PORTS.includes(parsed.port)) throw new Error(`port ${parsed.port} belongs to a peer service`);
  return Object.freeze({ ...DEFAULTS, ...parsed });
}

export const selectWalkers = (count) => WALKERS.slice(0, count);

export function sessionCookie(walker) {
  if (!isFixtureWalker(walker)) throw new Error("not a fixture walker");
  return `nervix_session=${walker.sessionId}`;
}

/** mulberry32: a small seeded RNG in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grow = (b, m) => Object.freeze({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });

/** Walkable plaza from the slice manifest: bounds inset and kept inside the server clamp, padded obstacles, the fountain. */
export function plazaLayout(manifest) {
  const plaza = manifest?.runtime_layout?.plaza;
  if (!plaza?.bounds || !plaza?.fountain) throw new Error("slice manifest has no plaza layout");
  const clamp = DEFAULT_PLACE_BOUNDS.plaza;
  const inner = grow(plaza.bounds, -EDGE_MARGIN_M);
  return Object.freeze({
    bounds: Object.freeze({
      minX: Math.max(inner.minX, clamp.minX), maxX: Math.min(inner.maxX, clamp.maxX),
      minZ: Math.max(inner.minZ, clamp.minZ), maxZ: Math.min(inner.maxZ, clamp.maxZ),
    }),
    obstacles: Object.freeze((plaza.obstacles ?? []).map((o) => grow(o, OBSTACLE_MARGIN_M))),
    fountain: Object.freeze({ x: plaza.fountain.x, z: plaza.fountain.z, radius: plaza.fountain.radius + FOUNTAIN_MARGIN_M }),
  });
}

const inBox = (b, x, z) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

export function isBlocked(layout, x, z) {
  if (!inBox(layout.bounds, x, z)) return true;
  if (Math.hypot(x - layout.fountain.x, z - layout.fountain.z) < layout.fountain.radius) return true;
  return layout.obstacles.some((o) => inBox(o, x, z));
}

function pathClear(layout, from, to) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / PATH_SAMPLE_M);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (isBlocked(layout, from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) return false;
  }
  return true;
}

const randomPoint = (rng, { minX, maxX, minZ, maxZ }) => ({ x: minX + rng() * (maxX - minX), z: minZ + rng() * (maxZ - minZ) });

function pickTarget(rng, layout, from) {
  for (let i = 0; i < TARGET_TRIES; i += 1) {
    const p = randomPoint(rng, layout.bounds);
    if (Math.hypot(p.x - from.x, p.z - from.z) >= MIN_LEG_M && !isBlocked(layout, p.x, p.z) && pathClear(layout, from, p)) return Object.freeze(p);
  }
  return null;
}

const pause = (rng) => PAUSE_MIN_S + rng() * PAUSE_SPAN_S;

export function startWanderer(rng, layout) {
  for (let i = 0; i < START_TRIES; i += 1) {
    const p = randomPoint(rng, layout.bounds);
    if (!isBlocked(layout, p.x, p.z)) return Object.freeze({ x: p.x, z: p.z, yaw: rng() * Math.PI * 2 - Math.PI, target: null, pauseS: pause(rng) });
  }
  throw new Error("no free spot on the plaza");
}

/** One step: pause, pick a clear straight leg, or walk along it at WALK_SPEED_MPS. Returns a new frozen state. */
export function stepWanderer(w, dtS, rng, layout) {
  if (w.pauseS > 0) return Object.freeze({ ...w, pauseS: Math.max(0, w.pauseS - dtS) });
  const target = w.target ?? pickTarget(rng, layout, w);
  if (!target) return Object.freeze({ ...w, target: null, pauseS: PAUSE_MIN_S });
  const dx = target.x - w.x;
  const dz = target.z - w.z;
  const dist = Math.hypot(dx, dz);
  const yaw = dist > 0 ? Math.atan2(-dx, -dz) : w.yaw;
  const reach = WALK_SPEED_MPS * dtS;
  if (dist <= reach) return Object.freeze({ x: target.x, z: target.z, yaw, target: null, pauseS: pause(rng) });
  return Object.freeze({ x: w.x + (dx / dist) * reach, z: w.z + (dz / dist) * reach, yaw, target, pauseS: 0 });
}

async function fetchHealth(port, fetchImpl) {
  try {
    const res = await fetchImpl(`http://${WALKER_HOST}:${port}/health`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Opens one walker's socket with its fixture cookie and joins the plaza; rejects unless the server names it as that walker. */
function joinAs(walker, port, WebSocketImpl) {
  const ws = new WebSocketImpl(`ws://${WALKER_HOST}:${port}/presence`, { headers: { cookie: sessionCookie(walker) } });
  const joined = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${walker.key}: join timed out`)), JOIN_TIMEOUT_MS);
    const fail = (error) => (clearTimeout(timer), reject(error));
    ws.on("error", fail);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", place: "plaza" })));
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "error") return fail(new Error(`${walker.key}: ${msg.message}`));
      if (msg.type !== "welcome") return;
      const self = (msg.players ?? []).find((p) => p.id === msg.id);
      if (self?.name !== walker.name) return fail(new Error(`${walker.key}: fixture session not recognised (seed the walker fixtures)`));
      clearTimeout(timer);
      resolve();
    });
  });
  return { ws, joined };
}

const round2 = (v) => Math.round(v * 100) / 100;

function startLoop(sockets, { seconds, hz, rng, layout }) {
  let states = sockets.map(() => startWanderer(rng, layout));
  let moves = 0;
  let seq = 0;
  let timer = null;
  let finish;
  const done = new Promise((resolve) => (finish = resolve));
  const tick = () => {
    seq += 1;
    states = states.map((s) => stepWanderer(s, 1 / hz, rng, layout));
    sockets.forEach((ws, i) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "move", place: "plaza", x: round2(states[i].x), z: round2(states[i].z), yaw: round2(states[i].yaw), seq }));
      moves += 1;
    });
  };
  const stop = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    sockets.forEach((ws) => ws.close());
    finish(Object.freeze({ walkers: sockets.length, moves }));
  };
  timer = setInterval(tick, 1000 / hz);
  if (seconds > 0) setTimeout(stop, seconds * 1000);
  return Object.freeze({ stop, done });
}

/**
 * Runs the walkers. Resolves with { stop, done } once every walker has joined;
 * `done` resolves with { walkers, moves } after `seconds` (0 = until stop()).
 * Rejects with WalkerRefusal before any socket outside DEMO mode.
 */
export async function runWalkers({
  port, count = DEFAULTS.count, seconds = DEFAULTS.seconds, hz = DEFAULTS.hz, seed = DEFAULTS.seed,
  env = process.env, fetchImpl = fetch, WebSocketImpl = WebSocket, manifest, log = console.log,
}) {
  const early = envRefusal(env);
  if (early) throw new WalkerRefusal(early);
  const refusal = walkerRefusal(env, await fetchHealth(port, fetchImpl));
  if (refusal) throw new WalkerRefusal(refusal);
  const layout = plazaLayout(manifest ?? JSON.parse(readFileSync(MANIFEST_URL, "utf8")));
  const joins = selectWalkers(count).map((w) => joinAs(w, port, WebSocketImpl));
  try {
    await Promise.all(joins.map((j) => j.joined));
  } catch (error) {
    joins.forEach((j) => j.ws.close());
    throw error;
  }
  log(`fixture-walkers: ${joins.length} walkers on the plaza at ${WALKER_HOST}:${port}`);
  return startLoop(joins.map((j) => j.ws), { seconds, hz, rng: mulberry32(seed), layout });
}

async function main() {
  const args = parseWalkerArgs(process.argv.slice(2));
  const run = await runWalkers(args);
  process.once("SIGINT", run.stop);
  process.once("SIGTERM", run.stop);
  console.log(JSON.stringify(await run.done));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`fixture-walkers: ${error.message}`);
    process.exitCode = 1;
  });
}
