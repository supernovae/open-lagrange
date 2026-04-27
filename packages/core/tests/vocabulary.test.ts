import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BLOCKED = [
  ["Ag", "ent"].join(""),
  ["Auto", "nomous"].join(""),
  ["Br", "ain"].join(""),
];

const FILES = [
  "README.md",
  "open-cot-alignment.md",
  "docs/hatchet-notes.md",
  "docs/run-local.md",
  "packages/core/package.json",
  "packages/core/src/index.ts",
  "packages/core/src/activities/cognition.ts",
  "packages/core/src/mcp/mock-client.ts",
  "packages/core/src/mcp/mock-registry.ts",
  "packages/core/src/open-cot/adapters.ts",
  "packages/core/src/policy/policy-gate.ts",
  "packages/core/src/reconciliation/intent-validation.ts",
  "packages/core/src/reconciliation/records.ts",
  "packages/core/src/hatchet/client.ts",
  "packages/core/src/hatchet/json.ts",
  "packages/core/src/hatchet/worker.ts",
  "packages/core/src/hatchet/workflow-client.ts",
  "packages/core/src/approval/approval-store.ts",
  "packages/core/src/status/status-store.ts",
  "packages/core/src/schemas/capabilities.ts",
  "packages/core/src/schemas/delegation.ts",
  "packages/core/src/schemas/open-cot.ts",
  "packages/core/src/schemas/reconciliation.ts",
  "packages/core/src/workflows/project-reconciler.ts",
  "packages/core/src/workflows/task-reconciler.ts",
  "packages/core/src/tasks/generate-execution-plan.ts",
  "packages/core/src/tasks/discover-capabilities.ts",
  "packages/core/src/tasks/generate-task-artifact.ts",
  "packages/core/src/tasks/execute-mcp-intent.ts",
  "packages/core/src/tasks/run-critic.ts",
  "packages/core/src/tasks/record-status.ts",
  "packages/core/src/tasks/create-approval-request.ts",
  "apps/cli/src/index.ts",
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
