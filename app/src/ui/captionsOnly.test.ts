import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Decision D8 and David's rule: no robotic or system text-to-speech anywhere.
// Merchant replies are captions only.
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const BANNED = /speechSynthesis|SpeechSynthesisUtterance/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && path !== SELF ? [path] : [];
  });
}

test("no app source uses the browser speech synthesis voice", () => {
  const offenders = sourceFiles(SRC).filter((file) => BANNED.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("the merchant panel shows captions only: no read-aloud control or audio playback", () => {
  const panel = readFileSync(join(SRC, "ui", "AgentPanel.tsx"), "utf8");
  assert.doesNotMatch(panel, /Read aloud/);
  assert.doesNotMatch(panel, /new Audio\(/);
  assert.doesNotMatch(panel, /api\.speak\(/);
});
