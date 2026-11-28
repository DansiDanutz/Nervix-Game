/**
 * Display-name policy (C9). A name other players can see is printable text
 * of 2 to 40 characters (letters, marks, digits, spaces and . _ - ' + & ( )),
 * starts with a letter or digit, passes the local moderation deny-list
 * (moderation.mjs) and the chat no-links rule, and is not a reserved label
 * (Guest, Anonymous, You, staff titles, Nervix) or shaped like an internal id
 * (usr_, demo_, p_, prop_, bld_). The server applies it when a name is set
 * (POST /me/profile) and again before a name is broadcast, so an older stored
 * name that breaks it is shown as anonymous. Pure module.
 */
import { isDenied } from "./moderation.mjs";
import { hasLink } from "./presence-chat.mjs";

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'+&()-]*$/u;
const ID_SHAPED = /^(?:usr|demo|p|prop|bld|mer)_/i;
/** Compared after folding to lowercase ASCII letters and digits only ("G.u.e.s.t" is "guest"). */
const RESERVED = new Set([
  "guest", "anonymous", "anon", "you", "admin", "administrator", "moderator", "mod", "staff", "support", "system",
]);
const RESERVED_PREFIX = "nervix";

const compact = (name) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (raw) => raw.normalize("NFKC").replace(/\s+/g, " ").trim();
const refuse = (reason) => Object.freeze({ ok: false, reason });

function isReserved(name) {
  const folded = compact(name);
  return ID_SHAPED.test(name) || RESERVED.has(folded) || folded.startsWith(RESERVED_PREFIX);
}

/** `{ ok: true, name }` with the cleaned name, or `{ ok: false, reason }` (length, characters, moderated, reserved). */
export function validateDisplayName(raw) {
  if (typeof raw !== "string") return refuse("length");
  const name = clean(raw);
  const length = [...name].length;
  if (length < DISPLAY_NAME_MIN || length > DISPLAY_NAME_MAX) return refuse("length");
  if (isDenied(name) || hasLink(name)) return refuse("moderated");
  if (!ALLOWED.test(name)) return refuse("characters");
  if (isReserved(name)) return refuse("reserved");
  return Object.freeze({ ok: true, name });
}

/** A refused display name; the dispatcher maps it to 400 { error: "invalid_display_name" }. */
export class DisplayNameError extends Error {
  constructor(reason) {
    super(`display name refused: ${reason}`);
    this.name = "invalid_display_name";
    this.reason = reason;
  }
}

/** The cleaned name, or a DisplayNameError. */
export function assertDisplayName(raw) {
  const verdict = validateDisplayName(raw);
  if (!verdict.ok) throw new DisplayNameError(verdict.reason);
  return verdict.name;
}
