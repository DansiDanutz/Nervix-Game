/** Validation of builder offering (listing) input from request bodies. */

import { safeAppUrl } from "../entitlement.mjs";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 400;

export function offeringPatch(body) {
  const patch = {};
  if (body.name !== undefined) patch.name = String(body.name).slice(0, NAME_MAX);
  if (body.description !== undefined) patch.description = String(body.description).slice(0, DESCRIPTION_MAX);
  if (body.priceMinor !== undefined) {
    if (!Number.isSafeInteger(Number(body.priceMinor)) || Number(body.priceMinor) < 0) return { error: "invalid_price" };
    patch.priceMinor = Number(body.priceMinor);
  }
  if (body.currency !== undefined) patch.currency = String(body.currency).toUpperCase();
  if (body.appUrl !== undefined) {
    const safe = safeAppUrl(body.appUrl);
    if (!safe) return { error: "unsafe_app_url" };
    patch.appUrl = safe;
  }
  return { patch };
}

export function newOffering(body, builderId) {
  const appUrl = body.appUrl ? safeAppUrl(body.appUrl) : null;
  if (body.appUrl && !appUrl) return { error: "unsafe_app_url" };
  const priceMinor = Number(body.priceMinor);
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) return { error: "invalid_price" };
  const offering = {
    id: `off_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    builderId,
    name: String(body.name ?? "").trim().slice(0, NAME_MAX),
    description: body.description ? String(body.description).slice(0, DESCRIPTION_MAX) : null,
    priceMinor,
    currency: String(body.currency ?? "EUR").toUpperCase(),
    appUrl,
  };
  if (!offering.name) return { error: "name_required" };
  return { offering };
}
