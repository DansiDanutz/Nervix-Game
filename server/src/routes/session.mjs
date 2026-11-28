/** Demo sessions and email-code sign-in. */

import { createHash } from "node:crypto";
import { verificationEmail } from "../email.mjs";
import { newCodeRecord, verifyCode, normalizeEmail, isValidEmail } from "../auth.mjs";
import { cookie } from "./http.mjs";
import { validateDisplayName } from "../display-name.mjs";

const SESSION_DAYS = 7;
const DAY_MS = 86400000;
const SESSION_MAX_AGE_S = 604800;

/** The name stored when none is given or the given one fails the policy (C9); never the email's local part. */
export const NEUTRAL_DISPLAY_NAME = "Traveler";

/** C9: every write path stores only a name that passes the display-name policy. */
const storableName = (raw) => {
  const verdict = validateDisplayName(raw);
  return verdict.ok ? verdict.name : NEUTRAL_DISPLAY_NAME;
};

export function createSessionRoutes({ db }) {
  return {
    "POST /session": async (body) => {
      const session = {
        userId: body.userId ?? `demo_${Math.random().toString(36).slice(2, 10)}`,
        displayName: storableName(body.displayName),
        role: "player",
        demo: true,
      };
      await db.store?.ensureUser(session.userId, session.displayName);
      return session;
    },

    "POST /auth/signup": async (body) => {
      if (!db.store) return { error: "identity_requires_database" };
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) return { error: "invalid_email" };
      const userId = `usr_${createHash("sha256").update(email).digest("hex").slice(0, 12)}`;
      const displayName = storableName(body.displayName);
      await db.store.createUser({ id: userId, email, displayName, verified: false });
      const record = newCodeRecord(email);
      await db.store.createCode(record);
      const sent = db.email.available ? await db.email.send({ to: email, ...verificationEmail(record.code) }) : false;
      // The code is returned only when no email provider is configured.
      return { userId, email, displayName, verified: false, devCode: sent ? null : record.code, emailed: sent };
    },

    "POST /auth/login": async (body) => {
      if (!db.store) return { error: "identity_requires_database" };
      const email = normalizeEmail(body.email);
      const user = await db.store.findUserByEmail(email);
      if (!user) return { error: "no_such_user" };
      const record = newCodeRecord(email);
      await db.store.createCode(record);
      const sent = db.email.available ? await db.email.send({ to: email, ...verificationEmail(record.code) }) : false;
      return { userId: user.id, email, devCode: sent ? null : record.code, emailed: sent };
    },

    "POST /auth/verify": async (body, params) => {
      if (!db.store) return { error: "identity_requires_database" };
      const email = normalizeEmail(body.email);
      const record = await db.store.latestCode(email);
      const check = verifyCode({ record, code: String(body.code ?? "") });
      if (!check.ok) return { error: check.reason };
      await db.store.consumeCode(record.id);
      const user = await db.store.findUserByEmail(email);
      if (!user) return { error: "no_such_user" };
      await db.store.markVerified(user.id);
      if (db.store) {
        const sid = await db.store.createSession(user.id, new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString());
        params.res.setHeader("set-cookie", `nervix_session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_S}`);
      }
      return { userId: user.id, displayName: user.displayName, role: user.role, verified: true, demo: true };
    },

    "POST /auth/logout": async (_b, params) => {
      const token = cookie(params.req, "nervix_session");
      if (token) await db.store.deleteSession(token);
      params.res.setHeader("set-cookie", "nervix_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
      return { ok: true };
    },
  };
}
