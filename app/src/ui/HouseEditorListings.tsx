import { useState, type FormEvent } from "react";
import { ApiError } from "../net/api";
import { listingEditApi } from "../net/api/listingEditClient";
import {
  CATEGORY_OPTIONS,
  draftFromListing,
  listingPatch,
  newListingBody,
  slotChoices,
  type EditableListing,
  type ListingDraft,
} from "./listingEditModel";

/**
 * P4 owner-only listing editor: name, price, category, display slot and
 * active, plus new categorised listings. Rendered only inside HouseEditor,
 * which the house panel shows only when the server says canEdit; every write
 * is re-checked by the server (cross-owner and subscription-only get 403).
 */
const EMPTY_DRAFT: ListingDraft = Object.freeze({ name: "", price: "", category: "", slot: "", active: true });
const SLOTS = slotChoices();

type Report = (message: string) => void;
const refusal = (e: unknown) => (e instanceof ApiError ? `Refused: ${e.code}` : "Could not save");

function DraftFields({ draft, onChange, idPrefix }: { draft: ListingDraft; onChange: (d: ListingDraft) => void; idPrefix: string }) {
  const set = (patch: Partial<ListingDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <input aria-label="Listing name" value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Name" data-testid={`${idPrefix}-name`} />
      <input aria-label="Price in EUR" value={draft.price} onChange={(e) => set({ price: e.target.value })} placeholder="EUR" inputMode="decimal" data-testid={`${idPrefix}-price`} />
      <select aria-label="Category" value={draft.category} onChange={(e) => set({ category: e.target.value })} data-testid={`${idPrefix}-category`}>
        <option value="">No category</option>
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
      <select aria-label="Display slot" value={draft.slot} onChange={(e) => set({ slot: e.target.value })} data-testid={`${idPrefix}-slot`}>
        <option value="">Slot: automatic</option>
        {SLOTS.map((s) => (
          <option key={s.value} value={s.value}>Slot {s.value}</option>
        ))}
      </select>
    </>
  );
}

function ListingRow({ propertyId, listing, report, onSaved }: { propertyId: string; listing: EditableListing; report: Report; onSaved: () => void }) {
  const [draft, setDraft] = useState<ListingDraft>(() => draftFromListing(listing));
  const active = listing.active !== false;
  const send = async (patch: Parameters<typeof listingEditApi.updateHouseListing>[2], done: string) => {
    try {
      await listingEditApi.updateHouseListing(propertyId, listing.id, patch);
      report(done);
      onSaved();
    } catch (err) {
      report(refusal(err));
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const result = listingPatch(listing, draft);
    if ("error" in result) return report(result.error);
    void send(result.patch, "Listing saved");
  };
  return (
    <details className={`house-listings__item${active ? "" : " is-inactive"}`} data-testid={`listing-edit-${listing.id}`}>
      <summary>{listing.name}{active ? "" : " (inactive)"}</summary>
      <form onSubmit={save}>
        <DraftFields draft={draft} onChange={setDraft} idPrefix={`listing-${listing.id}`} />
        <div className="house-listings__actions">
          <button type="submit">Save listing</button>
          <button type="button" onClick={() => void (active ? send({ active: false }, "Listing deactivated") : send({ active: true }, "Listing reactivated"))} data-testid={`listing-${listing.id}-toggle`}>
            {active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </form>
    </details>
  );
}

function NewListing({ propertyId, report, onSaved }: { propertyId: string; report: Report; onSaved: () => void }) {
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const result = newListingBody(draft);
    if ("error" in result) return report(result.error);
    try {
      await listingEditApi.addCategorisedListing(propertyId, result.body);
      setDraft(EMPTY_DRAFT);
      report("Listing added");
      onSaved();
    } catch (err) {
      report(refusal(err));
    }
  };
  return (
    <form onSubmit={add} aria-label="Add a listing" data-testid="listing-new">
      <DraftFields draft={draft} onChange={setDraft} idPrefix="listing-new" />
      <button type="submit" data-testid="listing-new-add">Add listing</button>
    </form>
  );
}

export function HouseEditorListings({ propertyId, listings, report, onSaved }: { propertyId: string; listings: readonly EditableListing[]; report: Report; onSaved: () => void }) {
  return (
    <section className="house-listings" aria-label="Your listings">
      {listings.map((l) => (
        // Keyed by the saved values so a reload resets the row's draft.
        <ListingRow key={`${l.id}:${l.name}:${l.priceMinor}:${l.category}:${l.slot}:${l.active}`} propertyId={propertyId} listing={l} report={report} onSaved={onSaved} />
      ))}
      <NewListing propertyId={propertyId} report={report} onSaved={onSaved} />
    </section>
  );
}
