import type { Call } from "./http";
import type { Builder, House, HouseProfile } from "./types";

function houseQuery(listing?: string, app?: string): string {
  if (listing) return `?listing=${encodeURIComponent(listing)}`;
  return app ? `?app=${encodeURIComponent(app)}` : "";
}

export const houseEndpoints = (call: Call) => ({
  house: (propertyId: string, listing?: string, app?: string) =>
    call<{ house: House; canEdit: boolean }>(`/houses/${propertyId}${houseQuery(listing, app)}`),
  saveHouseProfile: (propertyId: string, patch: Partial<Omit<HouseProfile, "updatedAt">>) =>
    call<{ profile: HouseProfile }>(`/houses/${propertyId}/profile`, patch, "PATCH"),
  addHouseListing: (propertyId: string, listing: { name: string; priceMinor: number; currency: string }) =>
    call<{ offering: { id: string } }>(`/houses/${propertyId}/listings`, listing),
  builders: () => call<{ builders: Builder[] }>("/builders"),
});
