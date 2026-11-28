/**
 * Text moderation, local and simple: a deny-list matched on whole words after
 * folding case, accents, Cyrillic/Greek look-alikes and common letter swaps
 * (digits, @ $ ! |), with `*` as a one-letter wildcard, "ph" read as "f",
 * stretched letters squeezed, words split in two short halves ("fu ck") and
 * words spelled out with single letters ("s h i t", "a s h i t"). No external
 * service and no substring matching inside ordinary words, so innocent words
 * that contain a listed one pass. It is a speed bump, not a filter that
 * cannot be beaten: new spellings will get through until listed.
 *
 * The list is deliberately short and mild; extend DENIED_WORDS (lowercase,
 * letters only) after review. Pure module.
 */

/** Lowercase, letters only. Matched against whole words, never substrings. */
export const DENIED_WORDS = Object.freeze([
  "fuck", "fucker", "fucking", "fucked", "motherfucker", "fck", "fuk",
  "shit", "shitty", "bullshit",
  "cunt", "bitch", "bastard", "asshole", "arsehole", "dick", "dickhead", "cock", "pussy",
  "wanker", "twat", "slut", "whore", "prick",
]);

const squeeze = (word) => word.replace(/(.)\1+/g, "$1");
const DENIED = new Set(DENIED_WORDS);
const DENIED_SQUEEZED = new Set(DENIED_WORDS.map(squeeze));
const LETTER_SWAPS = Object.freeze({ 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s", "!": "i", "|": "i" });
const SWAPPABLE = /[013457@$!|]/g;
// Cyrillic and Greek letters that look like Latin ones (lowercase, after folding case).
const LOOKALIKES = Object.freeze({
  "а": "a", "в": "b", "с": "c", "ԁ": "d", "е": "e", "һ": "h", "н": "h", "і": "i", "ј": "j", "к": "k",
  "м": "m", "о": "o", "р": "p", "ѕ": "s", "т": "t", "у": "y", "υ": "u", "х": "x",
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "χ": "x",
});
const LOOKALIKE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "gu");
const MARKS = /\p{M}/gu;
const NOT_WORD = /[^a-z*]+/;
const WILDCARD = "*";
const MIN_WILDCARD_LETTERS = 2;
const MIN_SPELLED_RUN = 3;
const MAX_HALF = 3;
const MIN_HALF = 2;

/** Lowercase ASCII-ish form: accents dropped, look-alikes and symbols swapped for the letters they imitate. */
function fold(text) {
  return text
    .normalize("NFKD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(LOOKALIKE, (c) => LOOKALIKES[c])
    .replace(SWAPPABLE, (c) => LETTER_SWAPS[c] ?? c);
}

/** A word with `*` standing for one letter ("f*ck"), checked against the list itself. */
function deniedWildcard(word) {
  if (word.replace(/\*/g, "").length < MIN_WILDCARD_LETTERS) return false;
  const pattern = new RegExp(`^${word.replace(/\*/g, "[a-z]")}$`);
  return DENIED_WORDS.some((denied) => pattern.test(denied));
}

/** The word as typed, squeezed ("shiiitty" -> "shity") and with "ph" read as "f". */
const forms = (word) => [word, squeeze(word), word.replace(/ph/g, "f"), squeeze(word.replace(/ph/g, "f"))];

function deniedWord(word) {
  if (word.includes(WILDCARD)) return deniedWildcard(word);
  return forms(word).some((form) => DENIED.has(form) || DENIED_SQUEEZED.has(squeeze(form)));
}

/** Every stretch of at least three letters inside a spelled-out run ("a s h i t" -> "ash", ..., "shit"). */
function spans(run) {
  const out = [];
  for (let start = 0; start < run.length; start += 1) {
    for (let end = start + MIN_SPELLED_RUN; end <= run.length; end += 1) out.push(run.slice(start, end));
  }
  return out;
}

/** Words spelled out one letter at a time ("f u c k"), as every stretch of the joined run. */
function spelledWords(words) {
  const runs = [];
  let run = "";
  for (const word of [...words, ""]) {
    if (word.length === 1 && word !== WILDCARD) {
      run += word;
      continue;
    }
    if (run.length >= MIN_SPELLED_RUN) runs.push(...spans(run));
    run = "";
  }
  return runs;
}

const isHalf = (word) => word.length >= MIN_HALF && word.length <= MAX_HALF && !word.includes(WILDCARD);

/** Two short neighbours joined ("fu ck" -> "fuck"). Only halves of two or three letters. */
const splitWords = (words) =>
  words.slice(1).flatMap((word, i) => (isHalf(words[i]) && isHalf(word) ? [words[i] + word] : []));

/** True when the text contains a denied word, however it is cased, accented, swapped or spaced. */
export function isDenied(text) {
  if (typeof text !== "string") return false;
  const words = fold(text).split(NOT_WORD).filter(Boolean);
  return [...words, ...spelledWords(words), ...splitWords(words)].some(deniedWord);
}
