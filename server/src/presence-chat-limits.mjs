/**
 * Chat flood bounds (CT3). Each socket has its own say bucket, and lines are
 * also limited per signed-in user and per guest remote address, so opening
 * many sockets from one client does not multiply what it can say into a room.
 * Buckets that have refilled are swept, so idle keys hold no memory.
 */

const MS_PER_SECOND = 1000;

/** Per socket: three quick lines, then one every two seconds. */
export const DEFAULT_SAY_LIMIT = Object.freeze({ burst: 3, perSecond: 0.5 });
/** Per signed-in user, across all of their sockets. */
export const DEFAULT_SAY_USER_LIMIT = Object.freeze({ burst: 3, perSecond: 0.5 });
/** Per guest remote address; looser, since guests behind one NAT share it. */
export const DEFAULT_SAY_ADDRESS_LIMIT = Object.freeze({ burst: 6, perSecond: 1 });

/** Token buckets keyed by string. `take(key)` spends one token; `sweep()` drops full buckets. */
export function createKeyedLimiter({ burst, perSecond }, now = Date.now) {
  const buckets = new Map(); // key -> frozen { tokens, last }
  const tokensAt = (entry, t) => Math.min(burst, entry.tokens + ((t - entry.last) / MS_PER_SECOND) * perSecond);

  return Object.freeze({
    take(key) {
      const t = now();
      const entry = buckets.get(key);
      const tokens = entry ? tokensAt(entry, t) : burst;
      const ok = tokens >= 1;
      buckets.set(key, Object.freeze({ tokens: ok ? tokens - 1 : tokens, last: t }));
      return ok;
    },
    sweep() {
      const t = now();
      for (const [key, entry] of buckets) if (tokensAt(entry, t) >= burst) buckets.delete(key);
    },
    size: () => buckets.size,
  });
}

/**
 * The shared say limits: a signed-in player spends from their user bucket, a
 * guest from their address bucket. `take({ userId }, address)` is false when
 * that bucket is empty.
 */
export function createSayLimits({ perUser = DEFAULT_SAY_USER_LIMIT, perAddress = DEFAULT_SAY_ADDRESS_LIMIT } = {}, now = Date.now) {
  const users = createKeyedLimiter(perUser, now);
  const addresses = createKeyedLimiter(perAddress, now);
  return Object.freeze({
    take: ({ userId }, address) => (userId ? users.take(userId) : addresses.take(address)),
    sweep() {
      users.sweep();
      addresses.sweep();
    },
  });
}
