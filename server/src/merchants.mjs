/**
 * Merchant self-service validation.
 *
 * Pure so it can be tested without a database. The server is authoritative:
 * prices are integer minor units, templates are whitelisted, and an agent may
 * only be granted tools the platform knows.
 */

import { TOOLS } from "./agent.mjs";

export const TEMPLATES = Object.freeze(["merchant_house", "cafe_shop", "casino_venue"]);
export const FULFILLMENT = Object.freeze(["digital", "appointment", "delivery", "pickup"]);
export const TONES = Object.freeze(["warm", "formal", "playful"]);
export const LANGUAGES = Object.freeze(["en", "ro"]);
export const ALL_TOOLS = Object.freeze(Object.values(TOOLS));

export class MerchantError extends Error {
  constructor(message) {
    super(message);
    this.name = "MerchantError";
  }
}

export function validateProduct(input) {
  const sku = String(input.sku ?? "").trim();
  const name = String(input.name ?? "").trim();
  if (!/^[a-z0-9-]{1,40}$/.test(sku)) throw new MerchantError("sku must be lowercase letters, digits or dashes");
  if (!name || name.length > 80) throw new MerchantError("name is required (max 80)");
  const unitAmountMinor = Number(input.unitAmountMinor);
  if (!Number.isSafeInteger(unitAmountMinor) || unitAmountMinor < 0) throw new MerchantError("unitAmountMinor must be a non-negative integer");
  const currency = String(input.currency ?? "EUR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new MerchantError("currency must be ISO-4217");
  const fulfillment = String(input.fulfillment ?? "pickup");
  if (!FULFILLMENT.includes(fulfillment)) throw new MerchantError("unknown fulfillment");
  return { sku, name, unitAmountMinor, currency, fulfillment, active: input.active !== false };
}

export function validateAgentConfig(input) {
  const name = String(input.name ?? "").trim();
  if (!name || name.length > 40) throw new MerchantError("agent name is required (max 40)");
  const tone = String(input.tone ?? "warm");
  if (!TONES.includes(tone)) throw new MerchantError("unknown tone");
  const languages = (input.languages ?? ["en"]).map((l) => String(l).toLowerCase());
  if (languages.length === 0 || languages.some((l) => !LANGUAGES.includes(l))) throw new MerchantError("unsupported language");
  const allowed_actions = input.allowed_actions ?? [TOOLS.SEARCH_CATALOG, TOOLS.READ_PRODUCT];
  if (!Array.isArray(allowed_actions) || allowed_actions.some((a) => !ALL_TOOLS.includes(a))) throw new MerchantError("unknown tool");
  return { name, tone, languages: [...new Set(languages)], allowed_actions: [...new Set(allowed_actions)] };
}

export function validateAppearance(input) {
  const template = String(input.template ?? "merchant_house");
  if (!TEMPLATES.includes(template)) throw new MerchantError("unknown template");
  const palette = String(input.palette ?? "#e8dcc0");
  if (!/^#[0-9a-fA-F]{6}$/.test(palette)) throw new MerchantError("palette must be a hex colour");
  return { template, palette };
}