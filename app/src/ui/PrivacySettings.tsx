import { useEffect, useReducer } from "react";
import { ApiError, call } from "../net/api/http";
import { privacyEndpoints, shownAs, type PrivacySettings as Settings } from "../net/api/privacy";
import { INITIAL_PRIVACY_PANEL, canSavePrivacy, privacyPanelReducer, type PrivacyKey } from "./PrivacySettingsModel";
import "./PrivacySettings.css";

const privacy = privacyEndpoints(call);

const message = (e: unknown, fallback: string) =>
  e instanceof ApiError && e.status === 401 ? "Sign in to change your privacy settings." : e instanceof Error ? e.message : fallback;

const settingsOf = ({ hideName, anonymous }: Settings): Settings => ({ hideName, anonymous });

const OPTIONS: readonly { key: PrivacyKey; label: string; hint: string }[] = [
  { key: "hideName", label: "Hide my name", hint: "Other players see “Anonymous” above you and in chat." },
  { key: "anonymous", label: "Go anonymous", hint: "Also hides your saved appearance; you get a different look each visit." },
];

/** Presence privacy (C9): reads and writes the signed-in player's own settings (GET/PUT /me/privacy). */
export function PrivacySettings({ displayName, onClose }: { displayName: string; onClose?: () => void }) {
  const [state, dispatch] = useReducer(privacyPanelReducer, INITIAL_PRIVACY_PANEL);

  useEffect(() => {
    if (state.status !== "loading") return;
    let live = true;
    privacy.myPrivacy()
      .then((p) => live && dispatch({ type: "loaded", settings: settingsOf(p) }))
      .catch((e) => live && dispatch({ type: "failed", error: message(e, "could not load your privacy settings") }));
    return () => { live = false; };
  }, [state.status]);

  async function save() {
    if (!canSavePrivacy(state) || !state.chosen) return;
    dispatch({ type: "save" });
    try {
      dispatch({ type: "saved", settings: settingsOf(await privacy.savePrivacy(state.chosen)) });
    } catch (e) {
      dispatch({ type: "failed", error: message(e, "could not save") });
    }
  }

  const chosen = state.chosen;
  return (
    <section className="panel privacy-settings" aria-label="Privacy" data-testid="privacy-settings" data-status={state.status}>
      <header className="panel__head">
        <strong>Privacy</strong>
        <span className="panel__tag">{state.status === "saving" ? "saving" : "presence"}</span>
      </header>
      {state.status === "loading" && <p className="panel__hint">Loading your privacy settings…</p>}
      {chosen && state.status !== "error" && (
        <fieldset className="privacy-settings__options" disabled={state.status !== "ready"}>
          <legend className="privacy-settings__legend">What other players see</legend>
          {OPTIONS.map((o) => (
            <label key={o.key} className="privacy-settings__option">
              <input
                type="checkbox"
                data-testid={`privacy-${o.key}`}
                checked={o.key === "hideName" ? chosen.hideName || chosen.anonymous : chosen.anonymous}
                disabled={o.key === "hideName" && chosen.anonymous}
                onChange={() => dispatch({ type: "toggle", key: o.key })}
              />
              <span className="privacy-settings__label">{o.label}</span>
              <span className="privacy-settings__hint">{o.hint}</span>
            </label>
          ))}
          <p className="panel__hint" data-testid="privacy-shown-as">
            Others will see you as <strong>{shownAs(chosen, displayName)}</strong>. Saved changes reach the people around you within a minute, without leaving the city.
          </p>
        </fieldset>
      )}
      {state.error && <p className="panel__error" role="alert">{state.error}</p>}
      {state.status === "error" && (
        <button type="button" data-testid="privacy-retry" onClick={() => dispatch({ type: "retry" })}>Retry</button>
      )}
      <div className="panel__row">
        <button type="button" data-testid="privacy-save" onClick={save} disabled={!canSavePrivacy(state)}>Save privacy</button>
        {onClose && <button type="button" className="panel__link" onClick={onClose}>Close</button>}
      </div>
    </section>
  );
}
