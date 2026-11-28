/**
 * Who may customise a merchant house.
 *
 * Authority comes only from trusted server records:
 *   - an authenticated user (session),
 *   - the existing eligibility level (entitlement.mjs, BUILD required),
 *   - a merchant record owned by that user, verified and not suspended,
 *   - a house bound to that same merchant and owner.
 * A subscription only raises the level; it never creates merchant authority.
 * Visitors are read-only. Nothing here trusts client-supplied owner ids.
 */

import { LEVELS, atLeast, AccessError, safeAppUrl } from "./entitlement.mjs";

const WELCOME_MAX = 280;
const FEATURED_MAX = 6;
const ID_MAX = 64;
const THEMES = Object.freeze(["salon", "workshop", "gallery", "cafe"]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const MARKUP = /[<>]/;

export class HouseProfileError extends Error {
  constructor(message) {
    super(message);
    this.name = "HouseProfileError";
  }
}

function deny(message, code) {
  throw new AccessError(message, code);
}

function checkMerchant({ user, level, merchant }) {
  if (!user?.id) deny("sign in to edit", "unauthorized");
  if (!atLeast(level, LEVELS.BUILD)) deny("requires build eligibility", "insufficient_level");
  if (!merchant) deny("no merchant record for this account", "not_merchant");
  if (merchant.ownerId !== user.id) deny("not your merchant record", "cross_owner");
  if (!merchant.verified) deny("merchant is not verified", "unverified_merchant");
  if (merchant.suspended) deny("merchant is suspended", "suspended");
}

/** Throws AccessError unless the caller may edit this merchant's own records. */
export function authorizeMerchantEdit({ user, level, merchant }) {
  checkMerchant({ user, level, merchant });
  return true;
}

/** Throws AccessError unless the caller may customise this specific house. */
export function authorizeHouseEdit({ user, level, merchant, house }) {
  if (!user?.id) deny("sign in to edit", "unauthorized");
  if (!house) deny("unknown house", "unknown_house");
  checkMerchant({ user, level, merchant });
  if (house.ownerId !== user.id || house.merchantId !== merchant.id) {
    deny("not your house", "cross_owner");
  }
  return true;
}

/** Non-throwing form, used to tell the client whether to show edit controls. */
export function canEditHouse(args) {
  try {
    return authorizeHouseEdit(args);
  } catch (error) {
    if (error instanceof AccessError) return false;
    throw error;
  }
}

function cleanText(raw, max, field) {
  const text = String(raw).trim();
  if (text.length > max) throw new HouseProfileError(`${field} exceeds ${max} characters`);
  if (MARKUP.test(text)) throw new HouseProfileError(`${field} must be plain text`);
  return text;
}

function cleanDecor(raw) {
  if (typeof raw !== "object" || raw === null) throw new HouseProfileError("decor must be an object");
  const decor = {};
  if (raw.theme !== undefined) {
    if (!THEMES.includes(raw.theme)) throw new HouseProfileError(`decor.theme must be one of ${THEMES.join(", ")}`);
    decor.theme = raw.theme;
  }
  if (raw.accent !== undefined) {
    if (typeof raw.accent !== "string" || !HEX.test(raw.accent)) throw new HouseProfileError("decor.accent must be #rrggbb");
    decor.accent = raw.accent.toLowerCase();
  }
  if (raw.banner !== undefined) decor.banner = Boolean(raw.banner);
  return decor;
}

function cleanDisplay(raw) {
  if (typeof raw !== "object" || raw === null) throw new HouseProfileError("display must be an object");
  const display = {};
  if (raw.featuredListingIds !== undefined) {
    const ids = raw.featuredListingIds;
    if (!Array.isArray(ids) || ids.length > FEATURED_MAX) throw new HouseProfileError(`at most ${FEATURED_MAX} featured listings`);
    display.featuredListingIds = ids.map((id) => cleanText(id, ID_MAX, "listing id"));
  }
  if (raw.showApp !== undefined) display.showApp = Boolean(raw.showApp);
  return display;
}

/** Whitelists and bounds the editable profile. Unknown fields are dropped. */
export function validateHouseProfile(body) {
  const profile = {};
  // null clears the welcome; String(null) used to store the literal "null".
  if (body.welcome !== undefined) profile.welcome = body.welcome === null ? null : cleanText(body.welcome, WELCOME_MAX, "welcome");
  if (body.decor !== undefined) profile.decor = cleanDecor(body.decor);
  if (body.display !== undefined) profile.display = cleanDisplay(body.display);
  if (body.websiteUrl !== undefined) {
    const safe = body.websiteUrl === null ? null : safeAppUrl(body.websiteUrl);
    if (body.websiteUrl !== null && !safe) throw new HouseProfileError("websiteUrl must be a public https url");
    profile.websiteUrl = safe;
  }
  return profile;
}

/** Throws HouseProfileError unless every featured id is one of this house's own listings. */
export function checkFeaturedListings(display, ownListingIds) {
  const featured = display?.featuredListingIds;
  if (!featured) return true;
  const own = new Set(ownListingIds);
  const foreign = featured.filter((id) => !own.has(id));
  if (foreign.length) throw new HouseProfileError("featured listings must belong to this house");
  return true;
}
