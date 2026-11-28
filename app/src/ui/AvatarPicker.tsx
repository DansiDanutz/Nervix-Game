import { useEffect, useReducer, useRef, type KeyboardEvent } from "react";
import { api, ApiError, AVATAR_PRESETS, type AvatarPreset } from "../net/api";
import { INITIAL_PICKER, canSave, createPickerReducer, radioKeyTarget, radioTabIndex, type PickerState } from "./avatarPickerModel";
import { myPresetStore } from "../player/useMyPreset";
import "./AvatarPicker.css";

const PRESET_IDS: readonly string[] = AVATAR_PRESETS.map((p) => p.id);
const reducer = createPickerReducer(PRESET_IDS);

const message = (e: unknown, fallback: string) =>
  e instanceof ApiError && e.status === 401 ? "Sign in to choose an appearance." : e instanceof Error ? e.message : fallback;

/** Three stripes (tunic, trim, legs) over the skin tone: enough to tell presets apart. */
function Swatch({ preset }: { preset: AvatarPreset }) {
  const { tunic, trim, legs, skin } = preset.palette;
  return (
    <span className="avatar-picker__swatch" aria-hidden="true" style={{ background: skin }}>
      <span style={{ background: tunic }} />
      <span style={{ background: trim }} />
      <span style={{ background: legs }} />
    </span>
  );
}

function PresetGrid({ state, onChoose }: { state: PickerState; onChoose: (id: string) => void }) {
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = radioKeyTarget(PRESET_IDS, state.chosen, e.key);
    if (next === null || state.status !== "ready") return;
    // Arrows here pick a preset; they must not also walk the avatar.
    e.preventDefault();
    e.stopPropagation();
    onChoose(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-preset="${next}"]`)?.focus();
  }

  return (
    <div ref={group} className="avatar-picker__grid" role="radiogroup" aria-label="Appearance presets" onKeyDown={onKeyDown}>
      {AVATAR_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={state.chosen === p.id}
          tabIndex={radioTabIndex(PRESET_IDS, state.chosen, p.id)}
          data-preset={p.id}
          className="avatar-picker__option"
          disabled={state.status !== "ready"}
          onClick={() => onChoose(p.id)}
        >
          <Swatch preset={p} />
          <span className="avatar-picker__label">{p.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Appearance picker: reads and writes the signed-in player's own preset (GET/PUT /me/avatar). */
export function AvatarPicker({ onClose }: { onClose?: () => void }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_PICKER);

  useEffect(() => {
    if (state.status !== "loading") return;
    let live = true;
    api.myAvatar()
      .then((a) => live && dispatch({ type: "loaded", preset: a.preset }))
      .catch((e) => live && dispatch({ type: "failed", error: message(e, "could not load your appearance") }));
    return () => { live = false; };
  }, [state.status]);

  async function save() {
    if (!canSave(state) || !state.chosen) return;
    dispatch({ type: "save" });
    try {
      const saved = await api.saveAvatar(state.chosen);
      dispatch({ type: "saved", preset: saved.preset });
      myPresetStore.set(saved.preset); // the local avatar wears it at once

    } catch (e) {
      dispatch({ type: "failed", error: message(e, "could not save") });
    }
  }

  return (
    <section className="panel avatar-picker" aria-label="Appearance" data-testid="avatar-picker" data-saved-preset={state.saved ?? ""}>
      <header className="panel__head">
        <strong>Appearance</strong>
        <span className="panel__tag">{state.status === "saving" ? "saving" : "preset"}</span>
      </header>
      {state.status === "loading" && <p className="panel__hint">Loading your appearance…</p>}
      {state.status !== "loading" && state.status !== "error" && <PresetGrid state={state} onChoose={(id) => dispatch({ type: "choose", preset: id })} />}
      {state.error && <p className="panel__error" role="alert">{state.error}</p>}
      {state.status === "error" && (
        <button type="button" data-testid="avatar-picker-retry" onClick={() => dispatch({ type: "retry" })}>Retry</button>
      )}
      <div className="panel__row">
        <button type="button" onClick={save} disabled={!canSave(state)}>Save appearance</button>
        {onClose && <button type="button" className="panel__link" onClick={onClose}>Close</button>}
      </div>
    </section>
  );
}
