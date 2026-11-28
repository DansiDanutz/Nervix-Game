/**
 * Avatar appearance (C5). A player stores one preset id from
 * shared/contracts/avatar-presets.json, never raw colours. Identity always
 * comes from the session; this module only validates and shapes the data.
 */

import { readFileSync } from "node:fs";

const CONTRACT = JSON.parse(readFileSync(new URL("../../shared/contracts/avatar-presets.json", import.meta.url), "utf8"));

export const PRESET_IDS = Object.freeze(CONTRACT.presets.map((p) => p.id));
export const DEFAULT_PRESET = PRESET_IDS[0];

/** Only these body fields are understood; `userId` is tolerated and ignored (identity is the session). */
const ACCEPTED_FIELDS = Object.freeze(["preset", "userId"]);

/** Rejected appearance input; the dispatcher maps it to 400 { error: "invalid_avatar" }. */
export class AvatarError extends Error {
  constructor(message) {
    super(message);
    this.name = "invalid_avatar";
  }
}

export function isPresetId(value) {
  return typeof value === "string" && PRESET_IDS.includes(value);
}

/** Validates a PUT /me/avatar body and returns the frozen value to store. */
export function parseAvatarInput(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new AvatarError("body must be an object");
  const unknown = Object.keys(body).filter((k) => !ACCEPTED_FIELDS.includes(k));
  if (unknown.length) throw new AvatarError(`unknown field: ${unknown[0]}`);
  if (!isPresetId(body.preset)) throw new AvatarError(`preset must be one of ${PRESET_IDS.join(", ")}`);
  return Object.freeze({ preset: body.preset });
}

/** The public view of a stored row (or null): an unknown stored id falls back to the default. */
export function avatarView(row) {
  if (!row || !isPresetId(row.preset)) return Object.freeze({ preset: DEFAULT_PRESET, source: "default" });
  return Object.freeze({ preset: row.preset, source: "saved" });
}
