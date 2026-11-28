import type { Call } from "./http";
import type { CatalogItem, OrderSummary } from "./types";

export const orderEndpoints = (call: Call) => ({
  catalog: () => call<{ items: CatalogItem[] }>("/catalog"),
  orders: (userId: string) => call<{ orders: OrderSummary[] }>(`/orders?buyerId=${encodeURIComponent(userId)}`),
  payDemo: async (orderId: string) => {
    await call(`/orders/${orderId}/events`, { eventId: `demo_${orderId}_created`, type: "payment_created" }).catch(() => null);
    return call<{ order: OrderSummary }>(`/orders/${orderId}/events`, {
      eventId: `demo_${orderId}_paid_${Date.now()}`,
      type: "payment_succeeded",
    });
  },
  fulfil: (orderId: string) => call<{ order: OrderSummary }>(`/orders/${orderId}/fulfil`, {}),
  refund: (orderId: string, reason: string) => call<{ order: OrderSummary }>(`/orders/${orderId}/refund`, { reason }),
});
