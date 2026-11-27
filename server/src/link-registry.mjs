import pg from "pg";

export function linkRegistry(connectionString) {
  return connectionString ? new pg.Pool({ connectionString }) : null;
}

// Do not release a usable checkout URL until the receiver can route its payment.
export async function registeredCheckout(order, payments, registry) {
  if (!registry) throw new Error("Live checkout requires WORLD_REGISTRY_URL");
  const checkout = await payments.createCheckout(order);
  if (!checkout.checkoutId) throw new Error("Payment provider returned no link ID");
  await registry.query(
    "INSERT INTO world_payment_links (payment_link_id, game_order_id, expected_minor, is_test) VALUES ($1, $2, $3, false)",
    [checkout.checkoutId, order.id, order.totalMinor],
  );
  return { order: { ...order, paymentLinkId: checkout.checkoutId }, checkout };
}
