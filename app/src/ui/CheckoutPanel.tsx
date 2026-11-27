import { useCallback, useEffect, useState } from "react";
import { api, type OrderSummary } from "../net/api";

const LABEL: Record<string, string> = {
  created: "not paid",
  pending_payment: "awaiting payment",
  paid: "paid",
  fulfilled: "fulfilled",
  refunded: "refunded",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
};

export function CheckoutPanel({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void api.orders(userId).then((r) => setOrders(r.orders)).catch(() => setOrders([]));
  }, [userId]);

  useEffect(refresh, [refresh]);

  async function pay(id: string) {
    setBusy(id);
    try {
      await api.payDemo(id);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function refund(id: string) {
    setBusy(id);
    try {
      await api.refund(id, "requested by player");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function fulfil(id: string) {
    setBusy(id);
    try {
      await api.fulfil(id);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel" aria-label="Orders">
      <header className="panel__head">
        <strong>Orders</strong>
        <span className="panel__tag">demo NervixPay</span>
      </header>

      <ul className="panel__list">
        {orders.length === 0 && <li>No orders yet.</li>}
        {orders.map((o) => (
          <li key={o.id} className="panel__order">
            <span>
              {o.id} · {o.totalMinor} {o.currency}
            </span>
            <em>{LABEL[o.state] ?? o.state}</em>
            {o.state === "paid" && (
              <button type="button" onClick={() => fulfil(o.id)} disabled={busy === o.id}>
                Fulfil
              </button>
            )}
            {(o.state === "paid" || o.state === "fulfilled") && (
              <button type="button" onClick={() => refund(o.id)} disabled={busy === o.id}>
                Refund
              </button>
            )}
            {(o.state === "created" || o.state === "pending_payment") && (
              <button type="button" onClick={() => pay(o.id)} disabled={busy === o.id}>
                Pay (demo)
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="panel__hint">Simulated outcomes. A redirect is never proof of payment.</p>
    </section>
  );
}