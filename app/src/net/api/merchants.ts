import type { Call } from "./http";
import type { CatalogItem, Property } from "./types";

export const merchantEndpoints = (call: Call) => ({
  /** The server provisions for the session user; no userId is sent. */
  provision: (businessType = "merchant") =>
    call<{ property: Property; created: boolean }>("/merchants/provision", { businessType }),
  merchantProducts: (merchantId: string) => call<{ items: CatalogItem[] }>(`/merchants/${merchantId}/products`),
  addProduct: (merchantId: string, product: Omit<CatalogItem, "active">) =>
    call<{ product: CatalogItem }>(`/merchants/${merchantId}/products`, product),
  updateAgent: (merchantId: string, propertyId: string, config: Record<string, unknown>) =>
    call<{ config: Record<string, unknown> }>(`/merchants/${merchantId}/agent`, { propertyId, ...config }),
  updateAppearance: (merchantId: string, propertyId: string, appearance: Record<string, string>) =>
    call<{ appearance: Record<string, string> }>(`/merchants/${merchantId}/appearance`, { propertyId, ...appearance }),
});
