/**
 * CT3 repair: regression cases for the simple deny-list and the chat text
 * rules. The list stays local and short; these cases pin the folds that
 * catch the common ways around it, and the innocent words it must not touch.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { isDenied } from "../src/moderation.mjs";
import { cleanSay, moderateSay } from "../src/presence-chat.mjs";

const MARK_RUN = /\p{M}{3}/u;

test("symbol swaps and wildcards are seen through", () => {
  for (const text of ["f*ck", "sh!t", "sh|t", "f**k off", "b!tch"]) assert.equal(isDenied(text), true, text);
});

test("split, phonetic and stretched spellings are seen through", () => {
  for (const text of ["fu ck", "phuck", "shiiiitty", "a s h i t", "you s h i t head"]) {
    assert.equal(isDenied(text), true, text);
  }
});

test("Cyrillic and Greek look-alike letters fold to Latin", () => {
  for (const text of ["ѕhit", "ѕһіt", "fυck", "сunt", "SНIТ"]) assert.equal(isDenied(text), true, text);
});

test("the folds leave innocent text alone", () => {
  const innocent = [
    "Scunthorpe", "class assignment", "shiitake soup", "cocktail hour", "a b c", "phone home",
    "is it ok", "so it goes", "wow!", "a*b", "****", "Привет", "καλημέρα", "fu manchu",
  ];
  for (const text of innocent) assert.equal(isDenied(text), false, text);
});

test("bare-domain links are refused, ordinary dotted text is not", () => {
  for (const text of ["x.com/a", "go to discord.gg", "visit example.org now", "EXAMPLE.IO"]) {
    assert.deepEqual(moderateSay(text), { ok: false, reason: "moderated" }, text);
  }
  for (const text of ["e.g. this", "i.e. that", "node.js rocks", "3.14 is pi", "see you at 5.30"]) {
    assert.equal(moderateSay(text).ok, true, text);
  }
});

test("cleanSay keeps at most two combining marks per letter", () => {
  const zalgo = `h${"̶̗́".repeat(30)}i`;
  const cleaned = cleanSay(zalgo);
  assert.doesNotMatch(cleaned, MARK_RUN);
  assert.equal(cleaned.startsWith("h"), true);
  assert.equal(cleaned.endsWith("i"), true);
  assert.equal(moderateSay(`${"á̂̃̄".repeat(20)}`).ok, true, "capped, so it fits");
  assert.equal(cleanSay("नमस्ते"), "नमस्ते".normalize("NFKC"), "real scripts with one or two marks survive");
});
