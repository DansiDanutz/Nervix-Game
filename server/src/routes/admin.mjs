/** Admin routes. Admin identity comes from the session, never from a body or query userId. */

import { requireAdmin } from "./guards.mjs";

export function createAdminRoutes(ctx) {
  const { db } = ctx;
  return {
    "GET /admin/merchants": async (_b, params) => {
      await requireAdmin(ctx, params);
      return { merchants: await db.store.listMerchants() };
    },

    "POST /admin/merchants/:merchantId/suspend": async (_b, params) => {
      const admin = await requireAdmin(ctx, params);
      await db.store.setSuspended(params.merchantId, true);
      await db.store.addAudit({ actorId: admin.id, action: "merchant.suspend", subject: params.merchantId });
      return { merchant: params.merchantId, suspended: true };
    },

    "POST /admin/merchants/:merchantId/reinstate": async (_b, params) => {
      const admin = await requireAdmin(ctx, params);
      await db.store.setSuspended(params.merchantId, false);
      await db.store.addAudit({ actorId: admin.id, action: "merchant.reinstate", subject: params.merchantId });
      return { merchant: params.merchantId, suspended: false };
    },

    // Verification is an audited platform decision; no live NervixPay verification source is wired.
    "POST /admin/merchants/:merchantId/verify": async (body, params) => {
      const admin = await requireAdmin(ctx, params);
      const verified = body.verified !== false;
      if (!(await db.store.setMerchantVerified(params.merchantId, verified))) return { error: "unknown_merchant" };
      await db.store.addAudit({ actorId: admin.id, action: verified ? "merchant.verify" : "merchant.unverify", subject: params.merchantId });
      return { merchant: params.merchantId, verified };
    },

    "GET /admin/audit": async (_b, params) => {
      await requireAdmin(ctx, params);
      return { events: await db.store.listAudit() };
    },
  };
}
