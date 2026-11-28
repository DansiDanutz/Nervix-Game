/** The migration ledger lists every migration and the reserved numbers 016-020. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { migrationFiles, MIGRATIONS_DIR } from "./helpers/db.mjs";

const ledger = readFileSync(`${MIGRATIONS_DIR}/README.md`, "utf8");
const RESERVED = { "016": "S3", "017": "B1", "018": "P1", "019": "C9", "020": "B5" };

test("every migration file is in the ledger", () => {
  for (const file of migrationFiles()) assert.ok(ledger.includes(`\`${file}\``), file);
});

test("016-020 are reserved for their milestones", () => {
  for (const [num, owner] of Object.entries(RESERVED)) {
    assert.match(ledger, new RegExp(`\\| ${num} \\|[^\\n]*reserved: ${owner}`), num);
  }
});

test("migration numbers are unique", () => {
  const nums = migrationFiles().map((f) => f.slice(0, 3));
  assert.equal(new Set(nums).size, nums.length);
});
