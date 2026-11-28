/**
 * C8 over the real presence socket on a throwaway database: the walker service
 * joins the plaza as the seeded fixture walkers (their display names, never a
 * guest), wanders inside the plaza, and refuses when a session is not seeded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import WebSocket from "ws";

import { applySliceFixtures } from "../seed/fixtures/index.mjs";
import { WALKERS } from "../seed/fixtures/walkers.mjs";
import { seedWalkerFixtures } from "../seed/walker-fixtures.mjs";
import { plazaLayout, runWalkers } from "../scripts/fixture-walkers.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";
import { nextRoom, send, trackRoom } from "./helpers/presenceClient.mjs";

const PORT_SLOT = 13;
const COUNT = 3;
const ENV = Object.freeze({ NERVIX_WORLD_SLICE: "1" });
const MANIFEST = JSON.parse(readFileSync(new URL("../../app/public/slice/manifest.json", import.meta.url), "utf8"));
const available = pgAvailable();
let db;
let pool;
let server;
let port;

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_c8" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  await seedWalkerFixtures(pool, ENV); // the documented seed path (seed/walker-fixtures.mjs)
  port = await pickTestPort(PORT_SLOT);
  server = await startServer({ port, env: { DATABASE_URL: db.url, ...ENV } });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

async function observer() {
  const ws = trackRoom(new WebSocket(`ws://127.0.0.1:${port}/presence`));
  await new Promise((resolve) => ws.once("open", resolve));
  send(ws, { type: "join", place: "plaza" });
  return ws;
}

it("walkers join the plaza under their fixture names and move inside the plaza", async () => {
  const watch = await observer();
  const walk = await runWalkers({ port, count: COUNT, seconds: 2, hz: 5, seed: 5, env: ENV, log: () => {} });
  const names = WALKERS.slice(0, COUNT).map((w) => w.name).sort();
  const view = await nextRoom(watch, (v) => names.every((n) => v.players.some((p) => p.name === n && (p.x !== 0 || p.z !== 0))));
  const walkers = view.players.filter((p) => p.name !== "Guest");
  assert.deepEqual(walkers.map((p) => p.name).sort(), names);
  const { bounds } = plazaLayout(MANIFEST);
  for (const p of walkers) {
    assert.ok(p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ, `${p.name} at ${p.x},${p.z}`);
    assert.doesNotMatch(JSON.stringify(p), /usr_|sess_/);
  }
  const summary = await walk.done;
  assert.equal(summary.walkers, COUNT);
  assert.ok(summary.moves > COUNT * 3, `moves ${summary.moves}`);
  watch.close();
});

it("refuses and closes every socket when a walker session is not seeded", async () => {
  await pool.query("DELETE FROM sessions WHERE id = $1", [WALKERS[1].sessionId]);
  await assert.rejects(runWalkers({ port, count: 2, seconds: 1, env: ENV, log: () => {} }), /not recognised/);
});
