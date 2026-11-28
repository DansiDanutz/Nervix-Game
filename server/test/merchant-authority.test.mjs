/** S1 unit tests: app URL safety and merchant-bound provisioning (pure functions). */
import test from "node:test";
import assert from "node:assert/strict";

import { safeAppUrl } from "../src/entitlement.mjs";
import { provisionProperty } from "../src/provision.mjs";

const slots = [{ id: "slot-01", template: "merchant_house", district: "merchant-quarter" }];

test("safeAppUrl rejects IPv4 literals in every spelling", () => {
  for (const bad of [
    "https://127.0.0.1/x", "http://127.0.0.1/x", "https://10.0.0.5/", "http://10.1.2.3/",
    "https://192.168.1.1/", "https://172.16.0.1/", "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0/", "https://8.8.8.8/", "https://2130706433/", "https://0x7f000001/", "https://0177.0.0.1/",
    "https://10.0.0.5:8443/",
  ]) assert.equal(safeAppUrl(bad), null, bad);
});

test("safeAppUrl rejects IPv6 literals", () => {
  for (const bad of ["https://[::1]/", "https://[fd00::1]/", "https://[fe80::1]/", "https://[::ffff:10.0.0.1]/", "https://[2001:db8::1]/"]) {
    assert.equal(safeAppUrl(bad), null, bad);
  }
});

test("safeAppUrl rejects local and single-label host names", () => {
  for (const bad of [
    "https://localhost/", "https://localhost./", "https://LOCALHOST/", "https://app.localhost/",
    "https://printer.local/", "https://svc.internal/", "https://nas.home.arpa/", "https://intranet/",
  ]) assert.equal(safeAppUrl(bad), null, bad);
});

test("safeAppUrl still accepts public https host names", () => {
  assert.equal(safeAppUrl("https://dangg.live/"), "https://dangg.live/");
  assert.equal(safeAppUrl("https://app.example.test/x?y=1"), "https://app.example.test/x?y=1");
  assert.equal(safeAppUrl("https://10x.example.com/"), "https://10x.example.com/");
});

test("provisionProperty records the merchant it was provisioned for", () => {
  const { property, created } = provisionProperty({ userId: "usr_1", merchantId: "mer_1", businessType: "merchant", slots });
  assert.equal(created, true);
  assert.equal(property.merchantId, "mer_1");
  assert.ok(Object.isFrozen(property));
});

test("provisionProperty without a merchant keeps merchantId null", () => {
  const { property } = provisionProperty({ userId: "usr_2", businessType: "merchant", slots });
  assert.equal(property.merchantId, null);
});
