import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPAIGN_STATES as S, createCampaign, requestPayment, markPaid, activate, tick,
  pause, resume, cancel, findConflict, servableCampaign, CampaignError,
} from "../src/campaigns.mjs";

const base = {
  id: "cmp_1", merchantId: "mer_1", placementId: "plaza-board-1",
  priceMinor: 5000, currency: "EUR",
  startsAt: "2026-12-01T10:00:00.000Z", endsAt: "2026-12-08T10:00:00.000Z",
};

const paid = () => markPaid(requestPayment(createCampaign(base)), { verified: true });

test("draft campaign is created with an explicit period", () => {
  const c = createCampaign(base);
  assert.equal(c.state, S.DRAFT);
  assert.equal(c.paidAt, null);
});

test("rejects a non-integer price and a reversed period", () => {
  assert.throws(() => createCampaign({ ...base, priceMinor: 1.5 }), CampaignError);
  assert.throws(() => createCampaign({ ...base, endsAt: "2026-11-01T00:00:00.000Z" }), CampaignError);
});

test("unpaid campaign never becomes servable", () => {
  const c = requestPayment(createCampaign(base));
  assert.equal(c.state, S.AWAITING_PAYMENT);
  assert.equal(servableCampaign([c], base.placementId, "2026-12-02T00:00:00.000Z"), null);
});

test("payment must be verified", () => {
  const c = requestPayment(createCampaign(base));
  assert.throws(() => markPaid(c, { verified: false }), CampaignError);
});

test("scheduled campaign activates only at its start", () => {
  const c = paid();
  assert.equal(c.state, S.SCHEDULED);
  assert.equal(activate(c, "2026-11-30T00:00:00.000Z").state, S.SCHEDULED);
  assert.equal(activate(c, "2026-12-01T10:00:00.000Z").state, S.ACTIVE);
});

test("campaign expires after its period and stops serving", () => {
  const active = activate(paid(), "2026-12-02T00:00:00.000Z");
  const expired = tick(active, "2026-12-08T10:00:00.000Z");
  assert.equal(expired.state, S.EXPIRED);
  assert.equal(servableCampaign([expired], base.placementId, "2026-12-08T10:00:00.000Z"), null);
});

test("a paused campaign stops serving but can resume", () => {
  const active = activate(paid(), "2026-12-02T00:00:00.000Z");
  const paused = pause(active);
  assert.equal(paused.state, S.PAUSED);
  assert.equal(resume(paused).state, S.ACTIVE);
});

test("overlapping exclusive bookings conflict, adjacent ones do not", () => {
  const a = activate(paid(), "2026-12-02T00:00:00.000Z");
  const overlap = createCampaign({ ...base, id: "cmp_2", startsAt: "2026-12-04T00:00:00.000Z", endsAt: "2026-12-10T00:00:00.000Z" });
  assert.equal(findConflict(overlap, [a])?.id, "cmp_1");

  const after = createCampaign({ ...base, id: "cmp_3", startsAt: "2026-12-08T10:00:00.000Z", endsAt: "2026-12-15T00:00:00.000Z" });
  assert.equal(findConflict(after, [a]), null);

  const elsewhere = createCampaign({ ...base, id: "cmp_4", placementId: "cafe-board-1" });
  assert.equal(findConflict(elsewhere, [a]), null);
});

test("an unpaid draft cannot be cancelled into a servable state", () => {
  const c = cancel(createCampaign(base));
  assert.equal(c.state, S.CANCELLED);
  assert.equal(servableCampaign([c], base.placementId, "2026-12-02T00:00:00.000Z"), null);
});