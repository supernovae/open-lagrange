import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRepositoryPatch, createRepositoryReviewReport, proposeRepositoryPatch, readRepositoryFile, runRepositoryVerificationReport } from "../src/capability-packs/repository/executor.js";
import { assertAllowedCommand } from "../src/repository/command-policy.js";
import { loadRepositoryWorkspace } from "../src/repository/workspace.js";
import type { PatchPlan } from "../src/schemas/patch-plan.js";

describe("repository capability pack", () => {
  it("rejects path traversal and secret reads", () => {
    const root = repoFixture();
    const workspace = workspaceFor(root);
    expect(() => readRepositoryFile(workspace, { relative_path: "../outside.txt" })).toThrow(/outside/);
    expect(() => readRepositoryFile(workspace, { relative_path: ".env" })).toThrow(/Secret/);
  });

  it("enforces file size limits", () => {
    const root = repoFixture();
    writeFileSync(join(root, "large.txt"), "x".repeat(20));
    const workspace = { ...workspaceFor(root), max_file_bytes: 8 };
    expect(() => readRepositoryFile(workspace, { relative_path: "large.txt" })).toThrow(/byte limit/);
  });

  it("rejects changed hashes before writing", () => {
    const root = repoFixture();
    const workspace = workspaceFor(root);
    const plan = patchPlan("0".repeat(64));
    expect(() => applyRepositoryPatch(workspace, plan)).toThrow(/hash changed/);
  });

  it("patch preview does not write", () => {
    const root = repoFixture();
    const workspace = workspaceFor(root);
    const read = readRepositoryFile(workspace, { relative_path: "README.md" });
    proposeRepositoryPatch(workspace, patchPlan(read.sha256));
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# Demo\n");
  });

  it("rejects unsafe command syntax", () => {
    const root = repoFixture();
    const workspace = workspaceFor(root);
    expect(() => assertAllowedCommand(workspace, "npm test; rm -rf .")).toThrow(/unsupported shell/);
  });

  it("truncates verification output and creates review notes", async () => {
    const root = repoFixture();
    const workspace = {
      ...workspaceFor(root),
      allowed_commands: [{ command_id: "node_output", executable: "node", args: ["-e", "console.log('x'.repeat(30000))"], display: "node output" }],
    };
    const report = await runRepositoryVerificationReport(workspace, ["node_output"]);
    const review = createRepositoryReviewReport({
      goal: "Check output",
      changed_files: ["README.md"],
      diff_summary: "README changed",
      verification_report: report,
    });
    expect(report.results[0]?.truncated).toBe(true);
    expect(review.test_notes[0]).toContain("node output");
  });
});

function repoFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "open-lagrange-repo-"));
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "README.md"), "# Demo\n");
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  return root;
}

function workspaceFor(root: string) {
  return loadRepositoryWorkspace({
    repo_root: root,
    trace_id: "trace-test",
    dry_run: false,
  });
}

function patchPlan(expected_sha256: string): PatchPlan {
  return {
    patch_plan_id: "patch-plan-test",
    goal: "Update README",
    summary: "Update README",
    expected_preconditions: [],
    risk_level: "write",
    requires_approval: false,
    idempotency_key: "idem-test",
    files: [{
      relative_path: "README.md",
      operation: "modify",
      expected_sha256,
      full_replacement: "# Demo\n\nUpdated.\n",
      rationale: "Test patch",
    }],
  };
}
