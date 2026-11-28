/**
 * P4: the owner's listing edits (P1 server routes). Kept apart from houses.ts so
 * the interior lane does not edit the shared client. The server re-checks the
 * verified owner on every call; a refusal it sends as a 200 `{ error }` body is
 * turned into an error here so the form never reports it as saved. Type-only
 * imports, so Node tests it; the bound client is listingEditClient.ts.
 */
import type { Call } from "./http";

export interface ListingEditPatch {
  readonly name?: string;
  readonly priceMinor?: number;
  readonly category?: string | null;
  readonly slot?: number | null;
  readonly active?: boolean;
}

export interface CategorisedListing {
  readonly name: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly category: string | null;
  readonly slot: number | null;
}

type Offering = { offering: { id: string } };

export type RefusalError = (code: string) => Error;

const seg = encodeURIComponent;

export const listingEditEndpoints = (call: Call, refusal: RefusalError) => {
  const refused = <T>(result: T): T => {
    const code = (result as { error?: unknown })?.error;
    if (typeof code === "string") throw refusal(code);
    return result;
  };
  return {
    updateHouseListing: async (propertyId: string, listingId: string, patch: ListingEditPatch) =>
      refused(await call<Offering>(`/houses/${seg(propertyId)}/listings/${seg(listingId)}`, patch, "PATCH")),
    addCategorisedListing: async (propertyId: string, listing: CategorisedListing) =>
      refused(await call<Offering>(`/houses/${seg(propertyId)}/listings`, listing)),
  };
};
