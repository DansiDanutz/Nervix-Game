/**
 * Access levels and subscription source.
 *
 * Levels are derived only from trusted server state: a verified user row and a
 * subscription source. There is no client flag, no dev query parameter and no
 * payment-link creation here. The real subscription source is not wired, so the
 * default is fail-closed: nobody is a subscriber.
 */

export const LEVELS = Object.freeze({
  SIGNED_OUT: "signed_out",
  EXPLORE: "explore", // signed-up free account: public streets only
  BROWSE: "browse", // completed account: other businesses and offerings
  BUILD: "build", // active monthly subscriber: own house, app and catalog
});

const RANK = Object.freeze({
  [LEVELS.SIGNED_OUT]: 0,
  [LEVELS.EXPLORE]: 1,
  [LEVELS.BROWSE]: 2,
  [LEVELS.BUILD]: 3,
});

export class AccessError extends Error {
  constructor(message, code = "forbidden") {
    super(message);
    this.name = "AccessError";
    this.code = code;
  }
}

/**
 * The real subscription source. Not available in this environment, so it fails
 * closed. Tests inject fixtures directly into resolveLevel instead.
 */
export function subscriptionState(user) {
  // Test-only fixture, never active outside NODE_ENV=test.
  if (process.env.NODE_ENV === "test" && user && (process.env.NERVIX_WORLD_TEST_SUBSCRIBER ?? "").split(",").includes(user.id)) {
    return { active: true, source: "fixture" };
  }
  return { active: false, source: "unavailable", reason: "no_subscription_provider_configured" };
}

export function resolveLevel({ user, subscription = subscriptionState(user) }) {
  if (!user) return LEVELS.SIGNED_OUT;
  if (!user.profileCompleted && !user.emailVerified) return LEVELS.EXPLORE;
  if (!user.profileCompleted) return LEVELS.EXPLORE;
  return subscription.active ? LEVELS.BUILD : LEVELS.BROWSE;
}

export function atLeast(level, required) {
  return RANK[level] >= RANK[required];
}

export function requireLevel(level, required) {
  if (!atLeast(level, required)) {
    throw new AccessError(`requires ${required}`, "insufficient_level");
  }
  return true;
}

const APP_URL_MAX = 400;
const LOCAL_SUFFIXES = Object.freeze([".local", ".internal", ".localhost", ".home.arpa", ".lan"]);
// The WHATWG URL parser normalises every IPv4 spelling (decimal, hex, octal) to a dotted quad.
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

/** True for hosts that may reach this machine or a private network: IP literals, local names, single labels. */
function isPrivateHost(rawHost) {
  const host = rawHost.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || IPV4_LITERAL.test(host)) return true;
  if (host === "localhost" || !host.includes(".")) return true;
  return LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Only https, no credentials, no IP literals, no private or local hosts. */
export function safeAppUrl(raw) {
  if (typeof raw !== "string" || raw.length > APP_URL_MAX) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (isPrivateHost(u.hostname)) return null;
  return u.toString();
}
