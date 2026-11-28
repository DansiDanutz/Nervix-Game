/** Paid campaigns and ad placements. Methods run with `this` bound to a PostgresStore. */

export const campaignMethods = Object.freeze({
  async saveCampaign(campaign) {
    await this.pool.query(
      `INSERT INTO campaigns (id, merchant_id, placement_id, creative, state, starts_at, ends_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
         SET state = excluded.state,
             paid_at = excluded.paid_at,
             creative = excluded.creative`,
      [
        campaign.id, campaign.merchantId, campaign.placementId,
        JSON.stringify({ priceMinor: campaign.priceMinor, currency: campaign.currency }),
        campaign.state, campaign.startsAt, campaign.endsAt, campaign.paidAt,
      ],
    );
  },

  async listPlacements() {
    const { rows } = await this.pool.query(
      "SELECT id, district, kind, slot_id, price_minor, currency FROM ad_placements ORDER BY id",
    );
    return rows.map((r) => ({
      id: r.id, district: r.district, kind: r.kind,
      slotId: r.slot_id, priceMinor: r.price_minor, currency: r.currency,
    }));
  },

  async listCampaigns() {
    const { rows } = await this.pool.query(
      "SELECT id, merchant_id, placement_id, creative, state, starts_at, ends_at, paid_at FROM campaigns ORDER BY id",
    );
    return rows.map((r) => ({
      id: r.id,
      merchantId: r.merchant_id,
      placementId: r.placement_id,
      priceMinor: r.creative?.priceMinor ?? 0,
      currency: r.creative?.currency ?? "EUR",
      state: r.state,
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    }));
  },
});
