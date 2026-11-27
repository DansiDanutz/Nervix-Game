import test from "node:test";
import assert from "node:assert/strict";

import { generateCode, hashCode, newCodeRecord, verifyCode, isValidEmail, normalizeEmail, CODE_TTL_MS } from "../src/auth.mjs";

test("codes are six digits and hashed at rest", () => {
  const code = generateCode();
  assert.match(code, /^\d{6}$/);
  assert.equal(hashCode(code).length, 64);
  assert.notEqual(hashCode(code), code);
});

test("a fresh code verifies once", () => {
  const record = newCodeRecord("a@example.test");
  assert.equal(record.code.length, 6);
  assert.equal(verifyCode({ record, code: record.code }).ok, true);
});

test("wrong code is rejected", () => {
  const record = newCodeRecord("a@example.test");
  const wrong = record.code === "000000" ? "111111" : "000000";
  assert.deepEqual(verifyCode({ record, code: wrong }), { ok: false, reason: "mismatch" });
});

test("expired code is rejected", () => {
  const now = Date.now();
  const record = newCodeRecord("a@example.test", now);
  const later = now + CODE_TTL_MS + 1;
  assert.deepEqual(verifyCode({ record, code: record.code, now: later }), { ok: false, reason: "expired" });
});

test("a consumed code cannot be replayed", () => {
  const record = newCodeRecord("a@example.test");
  const used = { ...record, consumedAt: new Date().toISOString() };
  assert.deepEqual(verifyCode({ record: used, code: record.code }), { ok: false, reason: "already_used" });
});

test("missing code is reported, not treated as valid", () => {
  assert.deepEqual(verifyCode({ record: null, code: "123456" }), { ok: false, reason: "no_code" });
});

test("emails are normalized and validated", () => {
  assert.equal(normalizeEmail("  A@Example.TEST "), "a@example.test");
  assert.equal(isValidEmail("a@example.test"), true);
  assert.equal(isValidEmail("nope"), false);
});