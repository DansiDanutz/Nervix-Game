/** Paid campaigns and ad placements (demo state machine, persisted when a store exists). */

import {
  createCampaign, requestPayment, markPaid, tick, pause, resume, cancel,
  servableCampaign, findConflict,
} from "../campaigns.mjs";

/** POST /campaigns/:id/<action>: applies one transition to the campaign and persists it. */
function transition(db, apply) {
  return async (body, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = apply(db.campaigns[i], body); await db.store?.saveCampaign(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  };
}

export function createCampaignRoutes({ db }) {
  return {
    "GET /campaigns": async () => {
      if (!db.store) return { campaigns: db.campaigns };
      return { campaigns: await db.store.listCampaigns() };
    },

    "GET /placements": async () => {
      if (!db.store) return { placements: [{ id: "plaza-1", kind: "noticeboard", priceMinor: 5000, currency: "EUR" }] };
      return { placements: await db.store.listPlacements() };
    },

    "POST /campaigns": async (body) => {
      const campaign = createCampaign(body);
      const conflict = findConflict(campaign, db.campaigns);
      if (conflict) return { error: "placement_conflict", conflictWith: conflict.id };
      db.campaigns.push(campaign); await db.store?.saveCampaign(campaign);
      return { campaign };
    },

    "POST /campaigns/:id/request-payment": transition(db, (c) => requestPayment(c)),
    "POST /campaigns/:id/pay": transition(db, (c, body) => markPaid(c, { verified: body.verified === true })),
    "POST /campaigns/:id/tick": transition(db, (c, body) => tick(c, body.now)),
    "POST /campaigns/:id/pause": transition(db, (c) => pause(c)),
    "POST /campaigns/:id/resume": transition(db, (c) => resume(c)),
    "POST /campaigns/:id/cancel": transition(db, (c) => cancel(c)),

    "GET /placements/:id/servable": async (_b, p) => {
      const now = new Date().toISOString();
      const campaign = servableCampaign(db.campaigns, p.id, now);
      return { servable: Boolean(campaign), campaign: campaign ?? null };
    },
  };
}
