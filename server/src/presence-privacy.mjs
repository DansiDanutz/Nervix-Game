/**
 * Presence privacy (C9), pure rules.
 *
 * Settings, one row per user in `presence_settings` (migration 019):
 * - hideName: others see ANON_NAME instead of the display name.
 * - anonymous: hideName, and the saved appearance is replaced by a preset
 *   derived from the per-connection handle, so two visits cannot be linked by
 *   name or look.
 * Names are visible by default (D10). A failed settings lookup fails closed
 * to fully anonymous. Guests stay GUEST_NAME.
 *
 * The public presence view is fixed to exactly PUBLIC_FIELDS: the handle
 * (sent as `id`, as since S4), the shown name (the display name or the
 * anonymous label), preset, place, x, z and yaw. The legacy `district` is no
 * longer broadcast: no client code reads it.
 *
 * Decision on `seq` (C9 review, option b): it stays server-side only. The
 * server already drops a stale or repeated move (isNewerSeq), and the room
 * gets deltas in order on one socket, so the latest sample always wins. C6
 * was changed in the same repair: app/src/world/remoteCrowd.ts RemoteSample
 * and CrowdTrack carry no seq and `nextTrack` compares by place and pose only,
 * and RemotePlayer.seq in app/src/net/presenceCore.ts is optional and unread,
 * so `tsc --noEmit` holds.
 */
import { validateDisplayName } from "./display-name.mjs";

export const ANON_NAME = "Anonymous";
export const DEFAULT_PRIVACY = Object.freeze({ hideName: false, anonymous: false });
export const FAIL_CLOSED_PRIVACY = Object.freeze({ hideName: true, anonymous: true });
export const PUBLIC_FIELDS = Object.freeze(["id", "name", "preset", "place", "x", "z", "yaw"]);

const SETTING_KEYS = Object.freeze(["hideName", "anonymous"]);
/** `userId` is tolerated and ignored: identity is the session. */
const ACCEPTED_FIELDS = Object.freeze([...SETTING_KEYS, "userId"]);

/** Rejected settings input; the dispatcher maps it to 400 { error: "invalid_privacy" }. */
export class PrivacyError extends Error {
  constructor(message) {
    super(message);
    this.name = "invalid_privacy";
  }
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** The two booleans of a stored row (or null). Anything that is not a real boolean reads as the default. */
export function privacyView(row) {
  const pick = (key) => (typeof row?.[key] === "boolean" ? row[key] : DEFAULT_PRIVACY[key]);
  return Object.freeze({ hideName: pick("hideName"), anonymous: pick("anonymous") });
}

/** A new frozen settings value: `body`'s booleans over `current`. Throws PrivacyError on anything else. */
export function mergePrivacyInput(current, body) {
  if (!isPlainObject(body)) throw new PrivacyError("body must be an object");
  const unknown = Object.keys(body).filter((k) => !ACCEPTED_FIELDS.includes(k));
  if (unknown.length) throw new PrivacyError(`unknown field: ${unknown[0]}`);
  const given = SETTING_KEYS.filter((k) => body[k] !== undefined);
  if (given.length === 0) throw new PrivacyError("send hideName and/or anonymous");
  const wrong = given.find((k) => typeof body[k] !== "boolean");
  if (wrong) throw new PrivacyError(`${wrong} must be true or false`);
  const base = privacyView(current);
  return Object.freeze({ hideName: body.hideName ?? base.hideName, anonymous: body.anonymous ?? base.anonymous });
}

export const isNameHidden = (privacy) => privacy.hideName === true || privacy.anonymous === true;

/** The name other players see: the display name unless hidden, anonymous or refused by the policy. */
export function shownName(name, privacy) {
  if (isNameHidden(privacy)) return ANON_NAME;
  const verdict = validateDisplayName(name);
  return verdict.ok ? verdict.name : ANON_NAME;
}

/** The broadcast shape of a player record: exactly PUBLIC_FIELDS, never the user id, district or seq. */
export const publicView = ({ handle, name, preset, place, x, z, yaw }) =>
  Object.freeze({ id: handle, name, preset, place, x, z, yaw });
