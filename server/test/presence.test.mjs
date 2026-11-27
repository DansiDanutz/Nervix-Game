import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket from "ws";

import { attachPresence } from "../src/presence.mjs";

function withServer(fn) {
  return async () => {
    const server = http.createServer();
    attachPresence(server);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    try {
      await fn(`ws://127.0.0.1:${port}/presence`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  };
}

const open = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });

const next = (ws, type) =>
  new Promise((resolve) => {
    const onMessage = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        ws.off("message", onMessage);
        resolve(msg);
      }
    };
    ws.on("message", onMessage);
  });

test("two players see each other and a leaving player disappears", withServer(async (url) => {
  const a = await open(url);
  const b = await open(url);

  const welcomeA = next(a, "welcome");
  a.send(JSON.stringify({ type: "join", userId: "a", name: "Ada", district: "central-plaza" }));
  const wa = await welcomeA;
  assert.equal(wa.id, "a");
  assert.equal(wa.players.length, 1);

  const welcomeB = next(b, "welcome");
  b.send(JSON.stringify({ type: "join", userId: "b", name: "Bo" }));
  const wb = await welcomeB;
  assert.equal(wb.players.length, 2, "the newcomer sees both players");

  const moved = next(a, "players");
  b.send(JSON.stringify({ type: "move", x: 3, z: 4 }));
  const snapshot = await moved;
  const bo = snapshot.players.find((p) => p.id === "b");
  assert.equal(bo.x, 3);
  assert.equal(bo.z, 4);

  const removed = next(a, "players");
  b.close();
  const after = await removed;
  assert.equal(after.players.length, 1);
  assert.equal(after.players[0].id, "a");

  a.close();
}));

test("messages before join are ignored", withServer(async (url) => {
  const a = await open(url);
  const welcome = next(a, "welcome");
  a.send(JSON.stringify({ type: "move", x: 1, z: 1 }));
  a.send(JSON.stringify({ type: "join", userId: "solo" }));
  const w = await welcome;
  assert.equal(w.players.length, 1);
  assert.equal(w.players[0].x, 0, "the ignored move did not apply");
  a.close();
}));