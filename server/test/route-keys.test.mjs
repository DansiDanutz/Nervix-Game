/**
 * Black-box route-key snapshot: every one of the 66 "METHOD /path" keys is
 * served by the real server (in-memory mode, no database), and unknown keys
 * still get the router's 404. Runs the same before and after the F0 split.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const KEYS = JSON.parse(readFileSync(new URL("./snapshots/route-keys.json", import.meta.url), "utf8"));
const SAMPLE = "zz";
let server;

const samplePath = (pattern) => pattern.replace(/:(\w+)/g, SAMPLE);

async function probe(method, path) {
  const body = ["POST", "PATCH", "PUT"].includes(method) ? "{}" : undefined;
  const res = await fetch(`${server.base}${path}`, { method, body, headers: { "content-type": "application/json" } });
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  server = await startServer({ port: await pickTestPort(1) });
});
test.after(() => server?.stop());

test("the snapshot lists exactly 66 unique route keys", () => {
  assert.equal(KEYS.length, 66);
  assert.equal(new Set(KEYS).size, 66);
});

test("every snapshot route key is served (never the router 404)", async () => {
  const missing = [];
  for (const key of KEYS) {
    const [method, pattern] = key.split(" ");
    const r = await probe(method, samplePath(pattern));
    if (r.status === 404 && r.body.path !== undefined) missing.push(key);
  }
  assert.deepEqual(missing, []);
});

test("unknown keys still get the router 404 with the path", async () => {
  for (const [method, path] of [["GET", "/nope"], ["DELETE", "/orders/zz"], ["PUT", "/me"], ["GET", "/houses/a/b"]]) {
    const r = await probe(method, path);
    assert.equal(r.status, 404, `${method} ${path}`);
    assert.deepEqual(r.body, { error: "not_found", path });
  }
});
