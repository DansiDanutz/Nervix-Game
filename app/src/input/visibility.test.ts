import test from "node:test";
import assert from "node:assert/strict";
import { isShown } from "./visibility.ts";

test("an element with layout boxes is shown; display:none (no boxes), null and non-elements are not", () => {
  assert.equal(isShown({ getClientRects: () => ({ length: 1 }) }), true);
  assert.equal(isShown({ getClientRects: () => ({ length: 0 }) }), false);
  assert.equal(isShown(null), false);
  assert.equal(isShown(undefined), false);
  assert.equal(isShown({}), false);
});
