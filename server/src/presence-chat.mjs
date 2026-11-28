/**
 * Player chat inside one place (CT3), pure rules. A `say` is cleaned
 * (controls, format and bidi characters stripped, whitespace collapsed, at
 * most two combining marks kept per letter), capped in characters and checked
 * against the local deny-list and a no-links rule (schemes, www. and bare
 * domains on common top-level domains). The presence server broadcasts an accepted line once to the sender's
 * room and keeps nothing: no history, no log of the text.
 */
import { isDenied } from "./moderation.mjs";

export { DEFAULT_SAY_LIMIT } from "./presence-chat-limits.mjs";
export const SAY_MAX_CHARS = 140;

const LINE_BREAKS = /[\t\n\r\v\f]/g;
// Controls, format (zero-width, bidi overrides), lone surrogates and private use.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/gu;
const LINK = /(?:\bhttps?:\/\/|\bwww\.)/i;
const BARE_DOMAIN = /\b[a-z0-9-]+\.(?:com|net|org|io|gg|co|me|ly|app|dev|tv|xyz|info|biz|link|site|online|shop|ru|cn|uk|de)\b/i;
// A third combining mark and every one after it on the same letter (Zalgo stacks).
const MARK_PILE = /(\p{M}{2})\p{M}+/gu;

/** The text a player meant to show: printable, single-spaced, trimmed. Non-strings are empty. */
export function cleanSay(text) {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFKC")
    .replace(LINE_BREAKS, " ")
    .replace(INVISIBLE, "")
    .replace(MARK_PILE, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const rejected = (reason) => Object.freeze({ ok: false, reason });

/** `{ ok: true, text }` with the cleaned line, or `{ ok: false, reason }`. */
export function moderateSay(raw) {
  const text = cleanSay(raw);
  if (text.length === 0) return rejected("empty");
  if ([...text].length > SAY_MAX_CHARS) return rejected("too long");
  if (LINK.test(text) || BARE_DOMAIN.test(text) || isDenied(text)) return rejected("moderated");
  return Object.freeze({ ok: true, text });
}

/** The one frame a room receives for an accepted line: public handle and name only. */
export const sayFrame = ({ handle, name, place }, text) => ({ id: handle, name, place, text });
