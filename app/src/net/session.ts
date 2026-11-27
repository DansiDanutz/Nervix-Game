/**
 * Local demo session. No server, no real identity.
 *
 * A production session must verify email ownership through NervixPay's supported
 * integration; matching email addresses alone never grant access to an existing
 * account.
 */

export type Role = "player" | "merchant_owner" | "merchant_staff" | "admin";

export interface Session {
  userId: string;
  displayName: string;
  role: Role;
  demo: true;
}

const KEY = "nervix.session.v1";

export function loadSession(): Session {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Session;
    } catch {
      localStorage.removeItem(KEY);
    }
  }
  const session: Session = {
    userId: `demo_${Math.random().toString(36).slice(2, 10)}`,
    displayName: "Traveler",
    role: "player",
    demo: true,
  };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function saveSession(session: Session): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}