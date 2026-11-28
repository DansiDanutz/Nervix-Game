import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards (the .tsx files cannot run under node --test). The real
// visibility check is app/e2e/talk-merchant.spec.ts (toBeVisible inside the house).
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

test("talk and the merchant workspace are interior panels, outside the hidden side column", () => {
  assert.ok(existsSync(join(SRC, "features", "interiorPanels.tsx")));
  const interior = read("features", "interiorPanels.tsx");
  assert.match(interior, /<TalkToMerchant\b/);
  assert.match(interior, /<MerchantWorkspace\b/);
  assert.match(interior, /slot: "overlay"/);
  const side = read("features", "sidePanels.tsx");
  assert.doesNotMatch(side, /<TalkToMerchant\b/, "talk would mount twice (and sit in display:none) inside a house");
  assert.doesNotMatch(side, /<MerchantWorkspace\b/);
});

test("the interior host renders only inside a house, never inside SideMenu, and resets per house", () => {
  const host = read("ui", "InteriorPanelHost.tsx");
  assert.match(host, /houseTarget\(/);
  assert.match(host, /key=\{target\.propertyId\}/);
  assert.match(host, /featuresIn\([^)]*"overlay"\)/);
  assert.match(host, /data-testid="interior-panels"/);
  assert.doesNotMatch(host, /SideMenu|app__side/);
  assert.match(host, /import "\.\/InteriorPanelHost\.css"/);
});

test("talk and workspace close on a real house change, not on unmount", () => {
  for (const file of ["TalkToMerchant.tsx", "MerchantWorkspace.tsx"]) {
    const src = read("ui", file);
    assert.match(src, /useCloseOnChange\(/, file);
    assert.doesNotMatch(src, /useEffect\(\(\) => \(\) => setOpen/, `${file} must not close on unmount`);
  }
});

test("the agent panel can propose a support request through the server tool", () => {
  const panel = read("ui", "AgentPanel.tsx");
  assert.match(panel, /supportRequest\(/);
  assert.match(panel, /api\.message\(propertyId, [^)]*\.tool, [^)]*\.args\)/);
  assert.match(panel, /data-testid="merchant-chat-support"/);
});
