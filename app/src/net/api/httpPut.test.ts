import test from "node:test";
import assert from "node:assert/strict";
import { createCall } from "./http.ts";

test("createCall sends PUT with a JSON body when asked", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  await createCall(fake)("/me/avatar", { preset: "sage" }, "PUT");
  assert.equal(seen[0].url, "/api/me/avatar");
  assert.equal(seen[0].init.method, "PUT");
  assert.equal(seen[0].init.body, JSON.stringify({ preset: "sage" }));
});
