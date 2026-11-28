import type { Call } from "./http";
import type { Session } from "./types";

export interface Me {
  userId: string | null;
  displayName: string | null;
  emailVerified: boolean;
  profileCompleted: boolean;
  level: string;
  subscription: { active: boolean; source: string };
}

export const authEndpoints = (call: Call) => ({
  me: () => call<Me>("/me"),
  health: () => call<{ ok: boolean; demo: boolean }>("/health"),
  authSignup: (email: string, displayName: string) =>
    call<{ userId: string; devCode: string; verified: boolean }>("/auth/signup", { email, displayName }),
  authLogin: (email: string) => call<{ userId: string; devCode: string }>("/auth/login", { email }),
  authVerify: (email: string, code: string) => call<Session & { verified: boolean }>("/auth/verify", { email, code }),
  session: (userId?: string) => call<Session>("/session", { userId }),
});
