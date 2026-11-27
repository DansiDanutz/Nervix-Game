import { useState } from "react";
import { api, type Session } from "../net/api";

type Mode = "login" | "signup";

export function AuthPanel({ onSignedIn }: { onSignedIn: (session: Session & { verified: boolean }) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const res = mode === "signup" ? await api.authSignup(email, name || email.split("@")[0]) : await api.authLogin(email);
      setDevCode(res.devCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.authVerify(email, code);
      onSignedIn(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="Account">
      <header className="panel__head">
        <strong>Account</strong>
        <span className="panel__tag">{mode === "signup" ? "create" : "sign in"}</span>
      </header>

      {!devCode ? (
        <>
          <label className="panel__field">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
          </label>
          {mode === "signup" && (
            <label className="panel__field">
              Display name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
            </label>
          )}
          <div className="panel__row">
            <button type="button" onClick={requestCode} disabled={busy || email.includes("@") === false}>
              {mode === "signup" ? "Create account" : "Send code"}
            </button>
            <button type="button" className="panel__link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "New here?" : "Have an account?"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="panel__hint">
            Demo code (emailed in production): <strong>{devCode}</strong>
          </p>
          <label className="panel__field">
            6-digit code
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
          </label>
          <div className="panel__row">
            <button type="button" onClick={verify} disabled={busy || code.length !== 6}>
              Verify
            </button>
            <button type="button" className="panel__link" onClick={() => { setDevCode(null); setCode(""); }}>
              Use another email
            </button>
          </div>
        </>
      )}

      {error && <p className="panel__error">{error}</p>}
    </section>
  );
}