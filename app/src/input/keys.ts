/**
 * One keyboard typing filter for the whole client: game keys never fire while
 * the player types into a field. Duck-typed so it is testable without a DOM.
 */
const TYPING_TAGS: readonly string[] = Object.freeze(["INPUT", "TEXTAREA", "SELECT"]);

export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === "string" && TYPING_TAGS.includes(el.tagName);
}

/** Normalised key name: lower-case for letters and named keys alike. */
export function keyName(e: { key: string }): string {
  return e.key.toLowerCase();
}
