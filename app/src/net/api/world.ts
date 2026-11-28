/**
 * B3 world directory: GET /world/houses lists the published houses of
 * verified, non-suspended merchants. The body is external data, so it is
 * parsed here: unknown fields, malformed or unverified entries and duplicate
 * ids are dropped, and accents that are not #rrggbb fall back to a default.
 * No runtime imports: unit-tested with Node type stripping.
 */
import type { Call } from "./http";

export interface WorldHouse {
  readonly plotId: string;
  readonly propertyId: string;
  readonly merchantName: string;
  readonly verified: true;
  readonly theme: string;
  readonly accent: string;
}

export const DEFAULT_ACCENT = "#e8dcc0";
const MAX_NAME = 80;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

function parseEntry(raw: unknown): WorldHouse | null {
  if (!isRecord(raw) || raw.verified !== true) return null;
  const { plotId, propertyId, merchantName, theme, accent } = raw;
  if (!isId(plotId) || !isId(propertyId) || typeof merchantName !== "string" || !merchantName.trim()) return null;
  return Object.freeze({
    plotId,
    propertyId,
    merchantName: merchantName.trim().slice(0, MAX_NAME),
    verified: true,
    theme: isId(theme) ? theme : "merchant_house",
    accent: typeof accent === "string" && HEX.test(accent) ? accent : DEFAULT_ACCENT,
  });
}

/** The directory list from a response body; never throws. First entry wins on a duplicate id. */
export function parseWorldHouses(body: unknown): readonly WorldHouse[] {
  const list = isRecord(body) && Array.isArray(body.houses) ? body.houses : [];
  const parsed = list.map(parseEntry).filter((h): h is WorldHouse => h !== null);
  const unique = parsed.filter((h, i) =>
    parsed.findIndex((o) => o.propertyId === h.propertyId || o.plotId === h.plotId) === i);
  return Object.freeze(unique);
}

export const worldEndpoints = (call: Call) => ({
  worldHouses: async () => parseWorldHouses(await call<unknown>("/world/houses")),
});
