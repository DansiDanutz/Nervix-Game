import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards for CT5 (.tsx cannot run under node --test). Behaviour: app/e2e/a11y.spec.ts.
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("the live region is a polite, atomic status that reads the announcer", () => {
  const src = read("ui/LiveRegion.tsx");
  assert.match(src, /role="status"/);
  assert.match(src, /aria-live="polite"/);
  assert.match(src, /aria-atomic="true"/);
  assert.match(src, /data-testid="live-region"/);
  assert.match(src, /nextAnnouncement\(/);
  assert.match(src, /import "\.\/LiveRegion\.css";/);
});

test("a11y styles hide the region visually only and honour reduced motion", () => {
  assert.ok(existsSync(join(SRC, "ui/LiveRegion.css")));
  const css = read("ui/LiveRegion.css");
  assert.match(css, /clip-path:\s*inset\(50%\)/);
  assert.doesNotMatch(css, /display:\s*none/, "display:none would silence the region");
  assert.match(css, /data-reduced-motion="true"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});

test("the settings panel labels every control, moves focus in and gives it back", () => {
  const src = read("ui/ControlSettings.tsx");
  assert.match(src, /import "\.\/ControlSettings\.css";/);
  assert.match(src, /aria-labelledby=/);
  assert.match(src, /type="range"/);
  assert.match(src, /type="checkbox"/);
  assert.match(src, /<fieldset/);
  assert.match(src, /<legend/);
  assert.match(src, /\.focus\(\)/);
  assert.match(src, /useEscapeLayer\(/);
  assert.match(src, /returnFocus/);
});

test("the settings panel is a side-panel feature with a stable id", () => {
  const src = read("features/controlSettingsPanel.tsx");
  assert.match(src, /CONTROL_SETTINGS_PANEL_ID = "controls"/);
  assert.match(src, /slot: "side"/);
  assert.match(src, /<ControlSettings/);
});

test("storage is only touched through the guarded model", () => {
  for (const rel of ["ui/ControlSettings.tsx", "ui/useControlSettings.ts", "features/controlSettingsPanel.tsx", "ui/LiveRegion.tsx"]) {
    assert.doesNotMatch(read(rel), /localStorage\.(getItem|setItem)/, rel);
  }
});
