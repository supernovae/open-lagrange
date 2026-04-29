import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRepositoryReviewReport } from "../src/capability-packs/repository/executor.js";
import { loadRepositoryWorkspace } from "../src/repository/workspace.js";
import { cleanupWorktreeSession, createWorktreeSession } from "../src/repository/worktree-manager.js";
import { exportFinalPatch } from "../src/repository/patch-exporter.js";
import { validateRepositoryPatchPlan } from "../src/repository/patch-validator.js";
import { nextRepairAttempt } from "../src/repository/repair-loop.js";
import type { RepositoryPatchPlan } from "../src/repository/patch-plan.js";

describe("repository Planfile to patch pipeline", () => {
  it("creates an isolated worktree and keeps the source worktree untouched", () => {
    const root = gitFixture();
    const session = createWorktreeSession({ repo_root: root, plan_id: "repo_plan_test" });
    writeFileSync(join(session.worktree_path, "README.md"), "# Demo\n\nChanged in worktree.\n");

    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# Demo\n");
    expect(readFileSync(join(session.worktree_path, "README.md"), "utf8")).toContain("Changed in worktree");

    cleanupWorktreeSession(session);
  });

  it("refuses a dirty base unless explicitly allowed", () => {
    const root = gitFixture();
    writeFileSync(join(root, "README.md"), "# Demo\n\nDirty.\n");

    expect(() => createWorktreeSession({ repo_root: root, plan_id: "repo_plan_dirty" })).toThrow(/uncommitted/);
    const session = createWorktreeSession({ repo_root: root, plan_id: "repo_plan_dirty_allowed", allow_dirty_base: true });
    cleanupWorktreeSession(session);
  });

  it("exports a final patch that applies to the recorded base", () => {
    const root = gitFixture();
    const session = createWorktreeSession({ repo_root: root, plan_id: "repo_plan_patch" });
    writeFileSync(join(session.worktree_path, "README.md"), "# Demo\n\nFinal patch.\n");

    const patch = exportFinalPatch(session);

    expect(patch.changed_files).toEqual(["README.md"]);
    expect(patch.unified_diff).toContain("Final patch.");
    cleanupWorktreeSession(session);
  });

  it("rejects denied files and changed hash preconditions", () => {
    const root = gitFixture();
    const workspace = loadRepositoryWorkspace({ repo_root: root, trace_id: "trace-test", dry_run: false });
    const readmeHash = sha(root, "README.md");

    const denied = validateRepositoryPatchPlan(workspace, patchPlan(".env", readmeHash));
    expect(denied.ok).toBe(false);
    expect(denied.errors.join("\n")).toMatch(/Secret|denied/i);

    const changedHash = validateRepositoryPatchPlan(workspace, patchPlan("README.md", "0".repeat(64)));
    expect(changedHash.ok).toBe(false);
    expect(changedHash.errors.join("\n")).toContain("expected hash does not match");
  });

  it("stops repair after repeated failures or max attempts", () => {
    const report = {
      results: [{
        command_id: "npm_run_typecheck",
        command: "npm run typecheck",
        exit_code: 2,
        stdout_preview: "",
        stderr_preview: "Type error",
        duration_ms: 10,
        truncated: false,
      }],
      passed: false,
      summary: "typecheck failed",
    };
    const first = nextRepairAttempt({ plan_id: "plan", node_id: "repair", previous_attempts: [], verification_report: report, now: "2026-04-28T12:00:00.000Z" });
    const second = nextRepairAttempt({ plan_id: "plan", node_id: "repair", previous_attempts: [first], verification_report: report, now: "2026-04-28T12:01:00.000Z" });
    const third = nextRepairAttempt({ plan_id: "plan", node_id: "repair", previous_attempts: [first, second], verification_report: report, now: "2026-04-28T12:02:00.000Z" });

    expect(first.status).toBe("pending");
    expect(third.status).toBe("yielded");
  });

  it("includes changed files and verification status in the final review", () => {
    const review = createRepositoryReviewReport({
      goal: "Update README",
      changed_files: ["README.md"],
      diff_summary: "README changed",
      verification_report: {
        results: [{
          command_id: "npm_run_typecheck",
          command: "npm run typecheck",
          exit_code: 0,
          stdout_preview: "",
          stderr_preview: "",
          duration_ms: 10,
          truncated: false,
        }],
        passed: true,
        summary: "passed",
      },
    });

    expect(review.pr_summary).toContain("README changed");
    expect(review.test_notes[0]).toContain("passed");
  });
});

function gitFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "open-lagrange-plan-patch-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "README.md"), "# Demo\n");
  writeFileSync(join(root, ".gitignore"), ".env\n.open-lagrange/\n");
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  git(root, ["add", "README.md", ".gitignore"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

function patchPlan(relative_path: string, expected_sha256: string): RepositoryPatchPlan {
  return {
    patch_plan_id: "patch-plan-test",
    plan_id: "plan-test",
    node_id: "patch_repo",
    summary: "Patch",
    rationale: "Test patch",
    evidence_refs: ["evidence-test"],
    operations: [{
      operation_id: "op-test",
      kind: "full_replacement",
      relative_path,
      expected_sha256,
      content: "changed\n",
      rationale: "Test operation",
    }],
    expected_changed_files: [relative_path],
    verification_command_ids: ["npm_run_typecheck"],
    preconditions: [],
    risk_level: "write",
    approval_required: true,
  };
}

function sha(root: string, path: string): string {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}
