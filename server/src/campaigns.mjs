/**
 * Paid campaign state machine.
 *
 * States: draft -> awaiting_payment -> scheduled -> active -> paused <-> active
 *         any -> expired | cancelled
 *
 * A campaign is published only when its payment is verified. Unpaid campaigns
 * never serve. Exclusive placements reject overlapping bookings.
 */

export const CAMPAIGN_STATES = Object.freeze({
  DRAFT: "draft",
  AWAITING_PAYMENT: "awaiting_payment",
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
});

const ALLOWED = Object.freeze({
  [CAMPAIGN_STATES.DRAFT]: [CAMPAIGN_STATES.AWAITING_PAYMENT, CAMPAIGN_STATES.CANCELLED],
  [CAMPAIGN_STATES.AWAITING_PAYMENT]: [CAMPAIGN_STATES.SCHEDULED, CAMPAIGN_STATES.CANCELLED, CAMPAIGN_STATES.EXPIRED],
  [CAMPAIGN_STATES.SCHEDULED]: [CAMPAIGN_STATES.ACTIVE, CAMPAIGN_STATES.CANCELLED],
  [CAMPAIGN_STATES.ACTIVE]: [CAMPAIGN_STATES.PAUSED, CAMPAIGN_STATES.EXPIRED, CAMPAIGN_STATES.CANCELLED],
  [CAMPAIGN_STATES.PAUSED]: [CAMPAIGN_STATES.ACTIVE, CAMPAIGN_STATES.CANCELLED, CAMPAIGN_STATES.EXPIRED],
  [CAMPAIGN_STATES.EXPIRED]: [],
  [CAMPAIGN_STATES.CANCELLED]: [],
});

const HEX = /^#[0-9a-fA-F]{6}$/;

export class CampaignError extends Error {
  constructor(message) {
    super(message);
    this.name = "CampaignError";
  }
}

function assertTransition(from, to) {
  if (!ALLOWED[from].includes(to)) throw new CampaignError(`illegal transition ${from} -> ${to}`);
}

export function createCampaign({ id, merchantId, placementId, priceMinor, currency, startsAt, endsAt, creative }) {
  if (!id || !merchantId || !placementId) throw new CampaignError("id, merchantId and placementId are required");
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new CampaignError("priceMinor must be a non-negative integer");
  if (typeof currency !== "string" || currency.length !== 3) throw new CampaignError("currency must be ISO-4217");
  const draft = creative ?? {};
  const text = String(draft.text ?? "").trim();
  if (text.length > 120) throw new CampaignError("creative text too long");
  const colour = String(draft.colour ?? "#e8dcc0");
  if (!HEX.test(colour)) throw new CampaignError("creative colour must be hex");
  const image = draft.image ? String(draft.image) : null;
  if (image && !/^https:\/\//.test(image)) throw new CampaignError("creative image must be https");

  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new CampaignError("invalid period");
  return Object.freeze({
    id, merchantId, placementId, priceMinor, currency,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    state: CAMPAIGN_STATES.DRAFT,
    creative: Object.freeze({ text, colour, image }),
    paidAt: null,
  });
}

/** Two exclusive bookings on the same placement may not overlap. */
export function findConflict(candidate, existing) {
  const start = Date.parse(candidate.startsAt);
  const end = Date.parse(candidate.endsAt);
  return existing.find((c) => {
    if (c.id === candidate.id) return false;
    if (c.placementId !== candidate.placementId) return false;
    if (![CAMPAIGN_STATES.SCHEDULED, CAMPAIGN_STATES.ACTIVE, CAMPAIGN_STATES.PAUSED].includes(c.state)) return false;
    const s = Date.parse(c.startsAt);
    const e = Date.parse(c.endsAt);
    return start < e && s < end;
  }) ?? null;
}

export function requestPayment(campaign) {
  assertTransition(campaign.state, CAMPAIGN_STATES.AWAITING_PAYMENT);
  return Object.freeze({ ...campaign, state: CAMPAIGN_STATES.AWAITING_PAYMENT });
}

/** Only a verified payment moves a campaign to scheduled. */
export function markPaid(campaign, { verified, at = new Date().toISOString() } = {}) {
  if (!verified) throw new CampaignError("payment is not verified");
  assertTransition(campaign.state, CAMPAIGN_STATES.SCHEDULED);
  return Object.freeze({ ...campaign, state: CAMPAIGN_STATES.SCHEDULED, paidAt: at });
}

export function activate(campaign, now = new Date().toISOString()) {
  if (campaign.state !== CAMPAIGN_STATES.SCHEDULED) return campaign;
  if (Date.parse(now) < Date.parse(campaign.startsAt)) return campaign;
  return Object.freeze({ ...campaign, state: CAMPAIGN_STATES.ACTIVE });
}

export function tick(campaign, now = new Date().toISOString()) {
  let next = activate(campaign, now);
  if ([CAMPAIGN_STATES.ACTIVE, CAMPAIGN_STATES.PAUSED].includes(next.state) && Date.parse(now) >= Date.parse(next.endsAt)) {
    assertTransition(next.state, CAMPAIGN_STATES.EXPIRED);
    next = Object.freeze({ ...next, state: CAMPAIGN_STATES.EXPIRED });
  }
  return next;
}

export function pause(campaign) {
  assertTransition(campaign.state, CAMPAIGN_STATES.PAUSED);
  return Object.freeze({ ...campaign, state: CAMPAIGN_STATES.PAUSED });
}

export function resume(campaign) {
  assertTransition(campaign.state, CAMPAIGN_STATES.ACTIVE);
  return Object.freeze({ ...campaign, state: CAMPAIGN_STATES.ACTIVE });
}

export function cancel(campaign) {
  assertTransition(campaign.state, CAMPAIGN_STATES.CANCELLED);
  return Object.freeze({ ...campaign, state: CAMPAIGN_STATES.CANCELLED });
}

/** A placement is servable only when a paid campaign covers `now`. */
export function servableCampaign(campaigns, placementId, now = new Date().toISOString()) {
  const t = Date.parse(now);
  return campaigns.find((c) =>
    c.placementId === placementId &&
    [CAMPAIGN_STATES.ACTIVE, CAMPAIGN_STATES.PAUSED].includes(c.state) &&
    Date.parse(c.startsAt) <= t && t < Date.parse(c.endsAt)) ?? null;
}