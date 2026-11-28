import test from "node:test";
import assert from "node:assert/strict";
import { uniqueById, othersOf, joinMessage, presenceUrl, retireSocket } from "./presence.ts";
import config, { apiTarget } from "../../vite.config.ts";

test("uniqueById keeps one avatar per player, latest position wins", () => {
  const out = uniqueById([
    { id: "a", name: "A", district: "d", x: 1, z: 1 },
    { id: "b", name: "B", district: "d", x: 2, z: 2 },
    { id: "a", name: "A", district: "d", x: 9, z: 9 },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.find((p) => p.id === "a"), { id: "a", name: "A", district: "d", x: 9, z: 9 });
});

test("othersOf drops the player's own server handle", () => {
  const players = [
    { id: "p_aaaaaaaaaaaa", name: "Me", district: "d", x: 0, z: 0 },
    { id: "p_bbbbbbbbbbbb", name: "You", district: "d", x: 1, z: 1 },
  ];
  assert.deepEqual(othersOf(players, "p_aaaaaaaaaaaa").map((p) => p.id), ["p_bbbbbbbbbbbb"]);
});

test("othersOf shows nobody until the server has named this connection", () => {
  const players = [{ id: "p_aaaaaaaaaaaa", name: "Me", district: "d", x: 0, z: 0 }];
  assert.deepEqual(othersOf(players, null), []);
});

test("the join message never carries a user id or a display name", () => {
  const msg = joinMessage("central-plaza");
  assert.deepEqual(msg, { type: "join", district: "central-plaza" });
  assert.doesNotMatch(JSON.stringify(msg), /usr_|demo_|userId|name/);
});

test("presence is same-origin by default, through the Vite /presence proxy", () => {
  assert.equal(presenceUrl({ protocol: "http:", host: "127.0.0.1:5173" }), "ws://127.0.0.1:5173/presence");
  assert.equal(presenceUrl({ protocol: "https:", host: "world.example" }), "wss://world.example/presence");
});

test("an explicit VITE_WS_URL still wins", () => {
  assert.equal(presenceUrl({ protocol: "http:", host: "h:1" }, "ws://127.0.0.1:28797/presence"), "ws://127.0.0.1:28797/presence");
});

test("the presence client source never falls back to port 8787", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./presence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /8787/);
});

test("vite proxies /presence as a WebSocket to the same target as /api", () => {
  process.env.VITE_API_TARGET = "http://127.0.0.1:28797";
  const resolved = typeof config === "function" ? config({ command: "serve", mode: "test" }) : config;
  const proxy = (resolved as { server: { proxy: Record<string, { target: string; ws?: boolean }> } }).server.proxy;
  assert.equal(proxy["/presence"].ws, true);
  assert.equal(proxy["/presence"].target, proxy["/api"].target);
});

test("the dev server refuses to start without VITE_API_TARGET instead of using port 8787", () => {
  assert.throws(() => apiTarget({}, "serve"), /VITE_API_TARGET/);
  assert.equal(apiTarget({ VITE_API_TARGET: "http://127.0.0.1:28797" }, "serve"), "http://127.0.0.1:28797");
  assert.doesNotMatch(apiTarget({}, "build"), /8787/);
});

test("retireSocket detaches every handler before closing, so a stale socket cannot touch state", () => {
  const calls: string[] = [];
  const noop = () => calls.push("handler");
  const fake = {
    onopen: noop as unknown,
    onmessage: noop as unknown,
    onclose: noop as unknown,
    onerror: noop as unknown,
    close() {
      calls.push(`close:${[this.onopen, this.onmessage, this.onclose, this.onerror].every((h) => h === null)}`);
      (this.onclose as (() => void) | null)?.();
    },
  };
  retireSocket(fake as unknown as WebSocket);
  assert.deepEqual(calls, ["close:true"], "handlers were null when close ran, and onclose never fired");
});

test("retireSocket tolerates no socket", () => {
  assert.doesNotThrow(() => retireSocket(null));
});

test("vite preview reuses the /presence proxy, so it also needs VITE_API_TARGET", () => {
  const saved = process.env.VITE_API_TARGET;
  delete process.env.VITE_API_TARGET;
  try {
    assert.throws(
      () => (typeof config === "function" ? config({ command: "serve", mode: "production", isPreview: true }) : config),
      /VITE_API_TARGET.*vite preview/s,
    );
  } finally {
    if (saved !== undefined) process.env.VITE_API_TARGET = saved;
  }
});
