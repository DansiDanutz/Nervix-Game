import { useEffect, useId, useRef, type ChangeEvent } from "react";
import { useEscapeLayer } from "../input/useEscapeLayer";
import {
  MOTION_PREFERENCES, SENSITIVITY_RANGE, withSetting, type ControlSettings as Settings, type MotionPreference,
} from "./controlSettingsModel";
import { controlSettingsStore, useControlSettings } from "./useControlSettings";
import "./ControlSettings.css";

const MOTION_LABEL: Readonly<Record<MotionPreference, string>> = Object.freeze({
  system: "Follow my device",
  on: "Reduce motion",
  off: "Full motion",
});

const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
  controlSettingsStore.set(withSetting(controlSettingsStore.get(), key, value));

function MotionChoice({ value }: { value: MotionPreference }) {
  return (
    <fieldset className="control-settings__group">
      <legend>Motion</legend>
      {MOTION_PREFERENCES.map((m) => (
        <label key={m} className="control-settings__choice">
          <input type="radio" name="control-motion" value={m} checked={value === m} onChange={() => update("reducedMotion", m)} />
          {MOTION_LABEL[m]}
        </label>
      ))}
    </fieldset>
  );
}

function SensitivitySlider({ value }: { value: number }) {
  const id = useId();
  const onChange = (e: ChangeEvent<HTMLInputElement>) => update("lookSensitivity", Number(e.target.value));
  return (
    <div className="control-settings__row">
      <label htmlFor={id}>Look sensitivity</label>
      <input
        id={id} type="range" min={SENSITIVITY_RANGE.min} max={SENSITIVITY_RANGE.max} step={SENSITIVITY_RANGE.step}
        value={value} aria-valuetext={`${value} times`} onChange={onChange} data-testid="control-sensitivity"
      />
      <output htmlFor={id} aria-hidden="true">{value.toFixed(2)}×</output>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, testId }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  const hintId = useId();
  return (
    <label className="control-settings__choice">
      <input type="checkbox" checked={checked} aria-describedby={hintId} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      {label}
      <small id={hintId} className="control-settings__hint">{hint}</small>
    </label>
  );
}

/**
 * CT5 control settings, saved in this browser only. Focus moves to the heading
 * when the panel opens and back to the opener (`returnFocus`) when it closes;
 * Esc closes it before it would leave a place.
 */
export function ControlSettings({ onClose, returnFocus }: { onClose: () => void; returnFocus?: () => HTMLElement | null }) {
  const settings = useControlSettings();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const returnRef = useRef(returnFocus);
  returnRef.current = returnFocus;

  useEffect(() => {
    heading.current?.focus();
    return () => returnRef.current?.()?.focus();
  }, []);
  useEscapeLayer(true, onClose);

  return (
    <section className="panel control-settings" aria-labelledby={headingId} data-testid="control-settings">
      <header className="panel__head">
        <h2 id={headingId} ref={heading} tabIndex={-1} className="control-settings__title">Controls</h2>
        <span className="panel__tag">this browser</span>
      </header>
      <MotionChoice value={settings.reducedMotion} />
      <SensitivitySlider value={settings.lookSensitivity} />
      <fieldset className="control-settings__group">
        <legend>Camera</legend>
        <Toggle label="Invert Y" hint="Drag down to look up." checked={settings.invertY} onChange={(v) => update("invertY", v)} testId="control-invert-y" />
        <Toggle
          label="Lock the pointer on click" hint="Move the mouse to look without holding a button. Esc releases it."
          checked={settings.pointerLock} onChange={(v) => update("pointerLock", v)} testId="control-pointer-lock"
        />
      </fieldset>
      <div className="panel__row">
        <button type="button" className="panel__link" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}
