/**
 * Email verification codes.
 *
 * Pure logic so it can be tested without a database. Codes are single-use,
 * hashed at rest, and expire. In production the code is delivered by email; in
 * this demo the API returns it and labels it `devCode`.
 */

import { createHash, randomInt } from "node:crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;
const DIGITS = 6;

export function generateCode() {
  return String(randomInt(0, 10 ** DIGITS)).padStart(DIGITS, "0");
}

export function hashCode(code) {
  return createHash("sha256").update(String(code)).digest("hex");
}

export function newCodeRecord(email, now = Date.now()) {
  const code = generateCode();
  return {
    email: String(email).toLowerCase(),
    codeHash: hashCode(code),
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
    code,
  };
}

export function verifyCode({ record, code, now = Date.now() }) {
  if (!record) return { ok: false, reason: "no_code" };
  if (record.consumedAt) return { ok: false, reason: "already_used" };
  if (Date.parse(record.expiresAt) < now) return { ok: false, reason: "expired" };
  if (record.codeHash !== hashCode(code)) return { ok: false, reason: "mismatch" };
  return { ok: true, reason: null };
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}