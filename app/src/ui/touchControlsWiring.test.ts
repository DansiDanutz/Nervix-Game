import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards (the .tsx cannot run under node --test). The behaviour
// itself is app/e2e/touch.spec.ts (hasTouch mobile profile).
const UI = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(UI, name), "utf8");

test("every hold button captures its pointer and releases on up, cancel and lost capture", () => {
  const src = read("TouchControls.tsx");
  assert.match(src, /setPointerCapture\(/);
  assert.match(src, /onPointerUp=/);
  assert.match(src, /onPointerCancel=/);
  assert.match(src, /onLostPointerCapture=/);
  assert.doesNotMatch(src, /touch\[\w+\]\s*=/, "writes go through the store, never into the shared object");
});

test("the run toggle reports its state and blur or a hidden tab releases held buttons", () => {
  const src = read("TouchControls.tsx");
  assert.match(src, /aria-pressed=\{/);
  assert.match(src, /toggleTouchRun/);
  assert.match(src, /"visibilitychange"/);
  assert.match(src, /"blur"/);
  assert.match(src, /releaseAllTouch/);
});

test("touch styles live in their own file with touch-action none and a safe-area gutter", () => {
  assert.ok(existsSync(join(UI, "TouchControls.css")));
  assert.match(read("TouchControls.tsx"), /import "\.\/TouchControls\.css";/);
  const css = read("TouchControls.css");
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /pointer:\s*fine/);
});
