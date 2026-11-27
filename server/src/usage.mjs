/**
 * Merchant usage metering and cap guard.
 *
 * Pure so it can be tested without a database. A merchant's monthly request cap
 * is a ceiling; when it is reached the agent stops starting new inference calls
 * rather than silently overrunning. The model never decides this.
 */

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function checkCap({ cap = null, used = 0 }) {
  if (cap === null || cap === undefined) return { allowed: true, remaining: null };
  if (!Number.isSafeInteger(cap) || cap < 0) throw new UsageError("cap must be a non-negative integer");
  if (!Number.isSafeInteger(used) || used < 0) throw new UsageError("used must be a non-negative integer");
  return { allowed: used < cap, remaining: Math.max(0, cap - used) };
}

export function addUsage({ requests = 0, tokens = 0 }) {
  if (!Number.isSafeInteger(requests) || requests < 0) throw new UsageError("requests must be a non-negative integer");
  if (!Number.isSafeInteger(tokens) || tokens < 0) throw new UsageError("tokens must be a non-negative integer");
  return { requests, tokens };
}