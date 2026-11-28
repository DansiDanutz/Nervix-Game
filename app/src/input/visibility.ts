/**
 * True when an element has layout boxes, i.e. neither it nor an ancestor is
 * display:none. Duck-typed so it is testable without a DOM.
 */
interface RectsLike {
  getClientRects?: () => { readonly length: number };
}

export function isShown(el: unknown): boolean {
  if (!el || typeof el !== "object") return false;
  const rects = (el as RectsLike).getClientRects;
  return typeof rects === "function" && rects.call(el).length > 0;
}
