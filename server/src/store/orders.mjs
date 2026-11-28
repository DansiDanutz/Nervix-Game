/** Orders and order items, written transactionally. Methods run with `this` bound to a PostgresStore. */

/** Thrown when a conditional save finds the stored order is no longer in the expected state. */
export class OrderConflictError extends Error {
  constructor(id, expectedState) {
    super(`order ${id} is no longer ${expectedState}`);
    this.name = "order_conflict";
  }
}

export const orderMethods = Object.freeze({
  /**
   * Insert or update an order. With `expectedState`, an existing row is updated
   * only while it is still in that state (compare-and-set), so two concurrent
   * transitions cannot both win; the loser gets an OrderConflictError.
   */
  async saveOrder(order, { expectedState = null } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const written = await client.query(
        `INSERT INTO orders (id, buyer_id, merchant_id, currency, total_minor, fulfillment, state, terms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
           SET state = excluded.state,
               total_minor = excluded.total_minor,
               updated_at = now()
           WHERE $9::text IS NULL OR orders.state = $9::text`,
        [order.id, order.buyerId, order.merchantId, order.currency, order.totalMinor, order.fulfillment, order.state, order.terms ?? null, expectedState],
      );
      if (written.rowCount === 0) throw new OrderConflictError(order.id, expectedState);
      await client.query("DELETE FROM order_items WHERE order_id = $1", [order.id]);
      for (const item of order.items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, sku, name, unit_amount_minor, quantity, line_total_minor)
           VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
          [order.id, item.sku, item.name, item.unitAmountMinor, item.quantity, item.lineTotalMinor],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async getOrder(id) {
    const { rows } = await this.pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    const row = rows[0];
    const items = (await this.pool.query("SELECT sku, name, unit_amount_minor, quantity, line_total_minor FROM order_items WHERE order_id = $1", [id])).rows;
    return {
      id: row.id,
      buyerId: row.buyer_id,
      merchantId: row.merchant_id,
      currency: row.currency,
      totalMinor: row.total_minor,
      fulfillment: row.fulfillment,
      state: row.state,
      terms: row.terms,
      items: items.map((i) => ({
        sku: i.sku, name: i.name, unitAmountMinor: i.unit_amount_minor,
        quantity: i.quantity, lineTotalMinor: i.line_total_minor,
      })),
      events: [],
    };
  },

  async listOrders(buyerId, limit = 20) {
    const { rows } = await this.pool.query(
      `SELECT id, state, total_minor, currency, fulfillment, created_at
       FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [buyerId, limit],
    );
    return rows.map((r) => ({
      id: r.id, state: r.state, totalMinor: r.total_minor,
      currency: r.currency, fulfillment: r.fulfillment, createdAt: r.created_at,
    }));
  },
});
