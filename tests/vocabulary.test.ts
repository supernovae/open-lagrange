import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BLOCKED = [
  ["Ag", "ent"].join(""),
  ["Auto", "nomous"].join(""),
  ["Br", "ain"].join(""),
  ["De", "cide"].join(""),
];

const FILES = [
  "README.md",
  "open-cot-alignment.md",
  "package.json",
  "src/activities/cognition.ts",
  "src/index.ts",
  "src/mcp/mock-registry.ts",
  "src/policy/policy-gate.ts",
  "src/schemas/capabilities.ts",
  "src/schemas/open-cot.ts",
  "src/util/hash.ts",
  "src/workflows/reconciler.ts",
  "tests/reconciliation.test.ts",
  "tests/schema.test.ts",
];

describe("language boundary", () => {
  it("keeps source vocabulary aligned with the project framing", async () => {
    const root = process.cwd();
    for (const file of FILES) {
      const text = await readFile(join(root, file), "utf8");
      for (const blocked of BLOCKED) {
        expect(text, `${blocked} found in ${file}`).not.toMatch(new RegExp(blocked, "i"));
      }
    }
  });
});
