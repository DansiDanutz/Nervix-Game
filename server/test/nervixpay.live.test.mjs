import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { createLiveAdapter, NervixPayError } from "../src/nervixpay.live.mjs";

const secret = "a".repeat(64);
const adapter = createLiveAdapter({ baseUrl: "https://pay.example.test", agentToken: "tok", webhookSecret: secret });

const body = Buffer.from(JSON.stringify({ event: "payment.paid", orderId: "ord_1", transactionId: "0xabc", paidAt: "2026-11-27T10:00:00.000Z" }));
const sign = (t, s = secret) => createHmac("sha256", s).update(`${t}.${body.toString()}`).digest("hex");

const headers = (t, v1 = sign(t)) => ({ "x-nervixpay-signature": `t=${t},v1=${v1}` });

test("a correctly signed payment.paid is accepted", () => {
  const now = Math.floor(Date.now() / 1000);
  const event = adapter.verifyWebhook(body, headers(now));
  assert.equal(event.type, "payment_succeeded");
  assert.match(event.eventId, /^nervixpay_ord_1_0xabc$/);
});

test("a wrong secret is rejected", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(() => adapter.verifyWebhook(body, headers(now, sign(now, "b".repeat(64)))), NervixPayError);
});

test("a stale timestamp is rejected", () => {
  const old = Math.floor(Date.now() / 1000) - 3600;
  assert.throws(() => adapter.verifyWebhook(body, headers(old)), /stale/);
});

test("a missing or malformed signature is rejected", () => {
  assert.throws(() => adapter.verifyWebhook(body, {}), /missing signature/);
  assert.throws(() => adapter.verifyWebhook(body, { "x-nervixpay-signature": "nonsense" }), /malformed/);
});

test("a body swapped after signing is rejected", () => {
  const now = Math.floor(Date.now() / 1000);
  const tampered = Buffer.from(body.toString().replace("ord_1", "ord_2"));
  assert.throws(() => adapter.verifyWebhook(tampered, headers(now)), NervixPayError);
});

test("an unsupported event type is rejected", () => {
  const other = Buffer.from(JSON.stringify({ event: "payment.failed", orderId: "ord_1" }));
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${other.toString()}`).digest("hex");
  assert.throws(() => adapter.verifyWebhook(other, { "x-nervixpay-signature": `t=${t},v1=${v1}` }), /unsupported event/);
});

test("the adapter refuses to build without configuration", () => {
  assert.throws(() => createLiveAdapter({ baseUrl: "", agentToken: "" }), NervixPayError);
});