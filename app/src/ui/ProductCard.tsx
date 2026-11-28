import { useSyncExternalStore, type KeyboardEvent } from "react";
import { DISPLAY_LABEL } from "../world/productSlotsKit";
import { categoryLabel } from "./listingEditModel";
import { productCardView, productSelection, type CardListing } from "./ProductCardModel";
import "./ProductCard.css";

/** The listing id selected in this house's room (ProductDisplays onSelect), or null. */
export function useSelectedProduct(propertyId: string): string | null {
  return useSyncExternalStore(productSelection.subscribe, () => productSelection.forHouse(propertyId));
}

/**
 * P4: read-only product card. Describes one listing of this house; it has no
 * order, payment or edit path, and its only control closes it.
 */
export function ProductCard({ listing, onClose }: { listing: CardListing; onClose: () => void }) {
  const view = productCardView(listing, categoryLabel);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose();
  };
  return (
    <div className="product-card" role="dialog" aria-label={`Product: ${view.name}`} data-testid="product-card" data-listing-id={view.listingId} onKeyDown={onKeyDown}>
      <div className="product-card__head">
        <strong data-testid="product-card-name">{view.name}</strong>
        <span className="product-card__category">{view.category}</span>
      </div>
      <p className="product-card__price" data-testid="product-card-price">{view.price}</p>
      {view.description && <p className="product-card__description">{view.description}</p>}
      <p className="product-card__note">
        <span className="product-card__badge">{DISPLAY_LABEL}</span> {view.note}
      </p>
      <button type="button" className="product-card__close" onClick={onClose} autoFocus data-testid="product-card-close">
        Close
      </button>
    </div>
  );
}
