import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, BASE, createCall } from "./http.ts";

type Seen = { url: string; init: RequestInit };
const fakeFetch = (status: number, payload: unknown, seen: Seen[]) =>
  (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return { ok: status < 400, status, json: async () => payload } as Response;
  }) as unknown as typeof fetch;

test("a call without a body is a GET under /api with no headers", async () => {
  const seen: Seen[] = [];
  const call = createCall(fakeFetch(200, { ok: true }, seen));
  assert.deepEqual(await call("/health"), { ok: true });
  assert.equal(BASE, "/api");
  assert.equal(seen[0].url, "/api/health");
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers, undefined);
  assert.equal(seen[0].init.body, undefined);
});

test("a call with a body is a JSON POST, or PATCH when asked", async () => {
  const seen: Seen[] = [];
  const call = createCall(fakeFetch(200, {}, seen));
  await call("/x", { a: 1 });
  await call("/y", { b: 2 }, "PATCH");
  assert.equal(seen[0].init.method, "POST");
  assert.deepEqual(seen[0].init.headers, { "content-type": "application/json" });
  assert.equal(seen[0].init.body, JSON.stringify({ a: 1 }));
  assert.equal(seen[1].init.method, "PATCH");
});

test("a failed call throws ApiError with the server's code and message", async () => {
  const call = createCall(fakeFetch(403, { error: "cross_owner", message: "not yours" }, []));
  await assert.rejects(call("/houses/p"), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 403);
    assert.equal(e.code, "cross_owner");
    assert.equal(e.message, "not yours");
    assert.equal(e.name, "ApiError");
    return true;
  });
});

test("a failed call without a JSON body falls back to a generic code and message", async () => {
  const call = createCall((async () => ({ ok: false, status: 502, json: async () => { throw new Error("html"); } })) as unknown as typeof fetch);
  await assert.rejects(call("/me"), (e: unknown) => e instanceof ApiError && e.code === "error" && e.message === "502 /me");
});
