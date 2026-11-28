import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards for CT2 wiring (the .tsx files cannot run under node --test).
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

test("TalkToMerchant binds to the current house through the place store and the house API", () => {
  assert.ok(existsSync(join(SRC, "ui", "TalkToMerchant.tsx")));
  const hook = read("ui", "useCurrentHouse.ts");
  assert.match(hook, /usePlace\(\)/);
  assert.match(hook, /houseTarget\(/);
  assert.match(hook, /\bapi\s*\.house\(/);
  const panel = read("ui", "TalkToMerchant.tsx");
  assert.match(panel, /useCurrentHouse\(/);
  assert.match(panel, /PRIVACY_HINT/);
});

test("TalkToMerchant is captions only", () => {
  const panel = read("ui", "TalkToMerchant.tsx");
  assert.doesNotMatch(panel, /api\.speak\(|new Audio\(|Read aloud/);
});

test("the agent panel confirms by the server's proposal id and labels proposals", () => {
  const panel = read("ui", "AgentPanel.tsx");
  assert.match(panel, /confirmPayload\(/);
  assert.match(panel, /pendingProposal\(/);
  assert.match(panel, /proposalLabel\(/);
});

test("interior panels register TalkToMerchant and gate the workspace on the server's verified owner", () => {
  const panels = read("features", "interiorPanels.tsx");
  assert.match(panels, /id: "talk"/);
  assert.match(panels, /<TalkToMerchant\b/);
  assert.match(panels, /<MerchantWorkspace\b/);
  assert.doesNotMatch(panels, /<MerchantPanel merchantId="mer_1"/);
  assert.doesNotMatch(panels, /<AgentPanel\b/, "the agent panel is reached only through TalkToMerchant");
  const gate = read("ui", "MerchantWorkspace.tsx");
  assert.match(gate, /workspaceFor\(/);
});
