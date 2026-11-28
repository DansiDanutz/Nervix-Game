import test from "node:test";
import assert from "node:assert/strict";
import { closeOnChange, withPanel } from "./panelOpenState.ts";

test("withPanel opens and closes by returning a new set, never mutating the old one", () => {
  const empty: ReadonlySet<string> = new Set();
  const opened = withPanel(empty, "talk", true);
  assert.deepEqual([...opened], ["talk"]);
  assert.equal(empty.size, 0);
  const closed = withPanel(opened, "talk", false);
  assert.deepEqual([...closed], []);
  assert.deepEqual([...opened], ["talk"]);
});

test("withPanel returns the same set when nothing changes (no re-render)", () => {
  const open: ReadonlySet<string> = new Set(["talk"]);
  assert.equal(withPanel(open, "talk", true), open);
  assert.equal(withPanel(open, "merchant", false), open);
});

test("closeOnChange closes only on a real change of key, never on the first value or an unmount", () => {
  assert.equal(closeOnChange(undefined, "prop_a"), false, "first mount keeps the panel's open state");
  assert.equal(closeOnChange("prop_a", "prop_a"), false, "a re-render with the same house keeps it open");
  assert.equal(closeOnChange("prop_a", "prop_b"), true, "another house starts closed");
  assert.equal(closeOnChange("prop_a", null), true, "leaving the house closes it");
});
