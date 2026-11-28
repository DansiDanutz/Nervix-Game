import { useState } from "react";
import { api } from "../net/api";

const LEVELS = [
  {
    id: "explore",
    title: "Signed-up free account",
    body: "Walk and explore the public streets, meet the city guide and play the adventure.",
  },
  {
    id: "browse",
    title: "Completed account",
    body: "Browse other businesses, their catalogues and offers, and talk to their AI employees.",
  },
  {
    id: "build",
    title: "Active monthly subscriber",
    body: "Build your own house and put your own app and catalogue inside, showing what you actually sell.",
  },
];

export function AccessGate({ onEnter }: { onEnter: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const res = mode === "signup" ? await api.authSignup(email, email.split("@")[0]) : await api.authLogin(email);
      if (!res.devCode) {
        onEnter();
        return;
      }
      // Email is sent, not a session. Enter only after the code is verified.
      setDevCode(res.devCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate__card">
        <h1>Nervix World</h1>
        <p className="gate__lead">
          The city is the interface. Choose how you take part — access comes from your verified
          account and subscription, never from the browser.
        </p>

        <ul className="gate__levels">
          {LEVELS.map((l) => (
            <li key={l.id} className="gate__level">
              <span className="gate__badge">{l.id}</span>
              <div>
                <strong>{l.title}</strong>
                <p>{l.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="gate__signin">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
          </label>
          {devCode ? (
            <>
              <p className="gate__hint">Demo code (emailed in production): <strong>{devCode}</strong></p>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" />
              <button
                type="button"
                disabled={busy || code.length !== 6}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.authVerify(email, code);
                    onEnter();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "verification failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Verify
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={signIn} disabled={busy || !email.includes("@")}>
                {mode === "signup" ? "Create account" : "Sign in"}
              </button>
              <button type="button" className="gate__link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
                {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
              </button>
            </>
          )}
          {error && <p className="gate__error">{error}</p>}
          <p className="gate__hint">Signed out? You can read this page, but entering needs an account.</p>
        </div>
      </div>
    </div>
  );
}