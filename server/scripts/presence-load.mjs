#!/usr/bin/env node
/**
 * Local presence load test (C4). Opens N bot sockets to one place, each moving
 * at a fixed rate inside the plaza, and reports join latency, move-to-delta
 * echo latency, frames and bytes received per bot, errors and, when it spawned
 * the server itself, the server's CPU and memory.
 *
 *   node scripts/presence-load.mjs --spawn --bots 50,100,200 --seconds 10
 *   node scripts/presence-load.mjs --url ws://127.0.0.1:PORT/presence --bots 50
 *
 * --spawn starts src/index.mjs on a free loopback port in demo mode (no
 * database, payment and email settings blanked) and stops it afterwards. It
 * never uses ports 8787, 18787, 28797 or 25183. Local use only: never point
 * --url at a shared or production server.
 */
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const RESERVED_PORTS = new Set([8787, 18787, 28797, 25183]);
const SERVER_ENTRY = fileURLToPath(new URL("../src/index.mjs", import.meta.url));
const PLAZA = Object.freeze({ minX: -40, maxX: 38, minZ: -38, maxZ: 38 });
const JOIN_TIMEOUT_MS = 10_000;
const START_ATTEMPTS = 50;
const START_DELAY_MS = 100;
const SAMPLE_MS = 500;
const RAMP_BATCH = 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = { bots: [50], seconds: 10, hz: 10, place: "plaza", spawn: false, url: null };
  for (let i = 0; i < argv.length; i += 1) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (key === "--spawn") args.spawn = true;
    else if (key === "--url") (args.url = value), (i += 1);
    else if (key === "--bots") (args.bots = value.split(",").map(Number)), (i += 1);
    else if (key === "--seconds") (args.seconds = Number(value)), (i += 1);
    else if (key === "--hz") (args.hz = Number(value)), (i += 1);
    else if (key === "--place") (args.place = value), (i += 1);
  }
  if (!args.spawn && !args.url) throw new Error("pass --spawn or --url ws://127.0.0.1:PORT/presence");
  if (args.bots.some((n) => !Number.isInteger(n) || n < 1 || n > 2000)) throw new Error("--bots must be integers 1..2000");
  if (!(args.seconds > 0 && args.hz > 0 && args.hz <= 30)) throw new Error("--seconds > 0 and 0 < --hz <= 30");
  return Object.freeze(args);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => (RESERVED_PORTS.has(port) ? resolve(freePort()) : resolve(port)));
    });
  });
}

async function spawnServer() {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: "test", PORT: String(port), DATABASE_URL: "", NERVIXPAY_AGENT_TOKEN: "", NERVIXPAY_BASE_URL: "", RESEND_API_KEY: "" };
  const child = spawn(process.execPath, [SERVER_ENTRY], { env, stdio: "ignore" });
  for (let i = 0; i < START_ATTEMPTS; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return { child, url: `ws://127.0.0.1:${port}/presence` };
    } catch {
      /* not up yet */
    }
    await sleep(START_DELAY_MS);
  }
  child.kill();
  throw new Error("server did not start");
}

/** { cpu: %, rssMb } of a process, from ps. */
function sampleProcess(pid) {
  const [cpu, rssKb] = execFileSync("ps", ["-o", "%cpu=,rss=", "-p", String(pid)], { encoding: "utf8" }).trim().split(/\s+/).map(Number);
  return { cpu, rssMb: rssKb / 1024 };
}

const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const round = (v, digits = 1) => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** One bot: joins, then reports frames, bytes and the latency from each move to its echo in a delta. */
function openBot(url, place, stats) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const sentAt = new Map(); // seq -> ms
    const bot = { ws, id: null, seq: 0, x: 0, z: 0, sentAt };
    const started = performance.now();
    const timer = setTimeout(() => {
      stats.errors.push("join timeout");
      resolve(null);
    }, JOIN_TIMEOUT_MS);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", place })));
    ws.on("error", (e) => stats.errors.push(e.message));
    ws.on("message", (raw) => {
      stats.frames += 1;
      stats.bytes += raw.length;
      const msg = JSON.parse(raw.toString());
      if (msg.type === "welcome") {
        bot.id = msg.id;
        stats.joinMs.push(performance.now() - started);
        clearTimeout(timer);
        resolve(bot);
      } else if (msg.type === "error") stats.errors.push(msg.message);
      else if (msg.type === "delta") recordEcho(bot, msg, stats);
    });
  });
}

function recordEcho(bot, delta, stats) {
  const self = delta.players.find((p) => p.id === bot.id);
  if (!self || !bot.sentAt.has(self.seq)) return;
  stats.echoMs.push(performance.now() - bot.sentAt.get(self.seq));
  for (const seq of bot.sentAt.keys()) if (seq <= self.seq) bot.sentAt.delete(seq);
}

function step(bot) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  bot.x = clamp(bot.x + (Math.random() - 0.5) * 2, PLAZA.minX, PLAZA.maxX);
  bot.z = clamp(bot.z + (Math.random() - 0.5) * 2, PLAZA.minZ, PLAZA.maxZ);
  bot.seq += 1;
  bot.sentAt.set(bot.seq, performance.now());
  bot.ws.send(JSON.stringify({ type: "move", x: bot.x, z: bot.z, yaw: 0, seq: bot.seq }));
}

async function runLevel({ url, bots: count, seconds, hz, place, pid }) {
  const stats = { frames: 0, bytes: 0, joinMs: [], echoMs: [], errors: [] };
  const bots = [];
  for (let i = 0; i < count; i += RAMP_BATCH) {
    const batch = await Promise.all(Array.from({ length: Math.min(RAMP_BATCH, count - i) }, () => openBot(url, place, stats)));
    bots.push(...batch.filter(Boolean));
  }
  const baseFrames = stats.frames;
  const baseBytes = stats.bytes;
  stats.echoMs.length = 0;
  const samples = [];
  const movers = bots.map((bot) => startMover(bot, hz));
  const sampler = pid ? setInterval(() => samples.push(sampleProcess(pid)), SAMPLE_MS) : null;
  await sleep(seconds * 1000);
  movers.forEach((stop) => stop());
  if (sampler) clearInterval(sampler);
  const frames = stats.frames - baseFrames;
  const bytes = stats.bytes - baseBytes;
  bots.forEach((bot) => bot.ws.close());
  await sleep(500);
  const perBotSecond = (v) => v / Math.max(1, bots.length) / seconds;
  return Object.freeze({
    bots: count,
    joined: bots.length,
    joinMsP50: round(percentile(stats.joinMs, 50)),
    joinMsP95: round(percentile(stats.joinMs, 95)),
    echoMsP50: round(percentile(stats.echoMs, 50)),
    echoMsP95: round(percentile(stats.echoMs, 95)),
    echoMsP99: round(percentile(stats.echoMs, 99)),
    framesPerBotPerSec: round(perBotSecond(frames)),
    kbPerBotPerSec: round(perBotSecond(bytes) / 1024),
    serverCpuPctAvg: samples.length ? round(samples.reduce((s, x) => s + x.cpu, 0) / samples.length) : null,
    serverRssMbMax: samples.length ? round(Math.max(...samples.map((x) => x.rssMb))) : null,
    errors: stats.errors.length,
    firstError: stats.errors[0] ?? null,
  });
}

/**
 * Moves `bot` at `hz`, starting at a random phase inside one period, so the
 * bots' timers do not line up with each other or with the server tick and the
 * echo percentiles sample the whole tick window. Returns the stop function.
 */
function startMover(bot, hz) {
  const period = 1000 / hz;
  let interval = null;
  const tick = () => bot.ws.readyState === WebSocket.OPEN && step(bot);
  const start = setTimeout(() => {
    interval = setInterval(tick, period);
  }, Math.random() * period);
  return () => {
    clearTimeout(start);
    if (interval) clearInterval(interval);
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = args.spawn ? await spawnServer() : null;
  const url = server?.url ?? args.url;
  const results = [];
  try {
    for (const bots of args.bots) {
      results.push(await runLevel({ url, bots, seconds: args.seconds, hz: args.hz, place: args.place, pid: server?.child.pid }));
      await sleep(1000);
    }
  } finally {
    server?.child.kill();
  }
  console.log(JSON.stringify({ url, seconds: args.seconds, moveHz: args.hz, node: process.version, results }, null, 2));
}

main().catch((error) => {
  console.error(`presence-load: ${error.message}`);
  process.exitCode = 1;
});
