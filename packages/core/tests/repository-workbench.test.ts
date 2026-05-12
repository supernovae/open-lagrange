import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createArtifactSummary, registerArtifacts } from "../src/artifacts/index.js";
import { buildRepositoryRunViewFromStatus, formatRepositoryDiff, formatRepositoryEvidence, formatRepositoryExplanation, formatRepositoryStatus, formatRepositoryVerification, formatRepositoryWorktree } from "../src/repository/index.js";
import type { RepositoryPlanStatus } from "../src/repository/repository-status.js";

const now = "2026-05-11T12:00:00.000Z";

describe("repository workbench", () => {
  it("builds a developer-facing repository run view from status and artifacts", () => {
    const root = join(".open-lagrange", "test-repository-workbench");
    const indexPath = join(root, "artifacts.json");
    mkdirSync(root, { recursive: true });
    const evidencePath = writeJson(root, "evidence.json", evidence());
    const patchPlanPath = writeJson(root, "patch-plan.json", patchPlan());
    const patchPath = writeJson(root, "patch.json", patchArtifact());
    const verificationPath = writeJson(root, "verification.json", verificationReport());
    const repairPath = writeJson(root, "repair.json", repairAttempt());
    const reviewPath = writeJson(root, "review.json", reviewReport());
    registerArtifacts({
      artifacts: [
        createArtifactSummary({ artifact_id: "evidence_1", kind: "evidence_bundle", title: "Evidence", summary: "Evidence", path_or_uri: evidencePath, content_type: "application/json", related_plan_id: "repo_plan_test", created_at: now }),
        createArtifactSummary({ artifact_id: "patch_plan_1", kind: "patch_plan", title: "PatchPlan", summary: "PatchPlan", path_or_uri: patchPlanPath, content_type: "application/json", related_plan_id: "repo_plan_test", validation_status: "passed", created_at: now }),
        createArtifactSummary({ artifact_id: "patch_artifact_1", kind: "patch_artifact", title: "Patch", summary: "Patch", path_or_uri: patchPath, content_type: "application/json", related_plan_id: "repo_plan_test", created_at: now }),
        createArtifactSummary({ artifact_id: "verification_1", kind: "verification_report", title: "Verification", summary: "Verification", path_or_uri: verificationPath, content_type: "application/json", related_plan_id: "repo_plan_test", created_at: now }),
        createArtifactSummary({ artifact_id: "repair_1", kind: "repair_decision", title: "Repair", summary: "Repair", path_or_uri: repairPath, content_type: "application/json", related_plan_id: "repo_plan_test", created_at: now }),
        createArtifactSummary({ artifact_id: "review_1", kind: "review_report", title: "Review", summary: "Review", path_or_uri: reviewPath, content_type: "application/json", related_plan_id: "repo_plan_test", created_at: now }),
      ],
      index_path: indexPath,
      now,
    });

    const view = buildRepositoryRunViewFromStatus({ status: status(), artifact_index_path: indexPath });

    expect(view.current_phase).toBe("verifying");
    expect(view.files.inspected.map((file) => file.path)).toContain("apps/cli/src/index.ts");
    expect(view.files.changed.map((file) => file.path)).toContain("apps/cli/src/index.ts");
    expect(view.patch_plans[0]?.operations[0]?.relative_path).toBe("apps/cli/src/index.ts");
    expect(view.verification_reports[0]?.passed).toBe(false);
    expect(view.repair_attempts[0]?.failure_summary).toContain("JSON output");
    expect(view.scope_expansion_requests[0]?.suggested_approve_command).toContain("repo scope approve");
    expect(view.final_patch?.export_command).toContain("repo patch");
    expect(view.phases.find((phase) => phase.phase_id === "verification_run")?.status).toBe("running");
  });

  it("formats repository CLI output with worktree, diff, evidence, and next actions", () => {
    const view = buildRepositoryRunViewFromStatus({ status: status() });
    expect(formatRepositoryStatus(view)).toContain("Worktree:");
    expect(formatRepositoryExplanation(view)).toContain("Next actions");
    expect(formatRepositoryEvidence(view)).toContain("No evidence bundle");
    expect(formatRepositoryVerification(view)).toContain("No verification report");
    expect(formatRepositoryWorktree(view)).toContain("cleanup:");
    expect(formatRepositoryDiff(view)).toContain("Diff: not available yet");
  });
});

function status(): RepositoryPlanStatus {
  return {
    schema_version: "open-lagrange.repository-status.v1",
    plan_id: "repo_plan_test",
    status: "running",
    current_node: "verify_repo",
    worktree_session: {
      worktree_id: "worktree_repo_plan_test",
      plan_id: "repo_plan_test",
      repo_root: "/repo",
      worktree_path: "/repo/.open-lagrange/worktrees/repo_plan_test",
      base_ref: "main",
      base_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      branch_name: "ol/repo_plan_test",
      status: "running",
      created_at: now,
      updated_at: now,
      retain_on_failure: true,
    },
    artifact_refs: ["evidence_1", "patch_plan_1", "patch_artifact_1", "verification_1", "repair_1", "review_1"],
    changed_files: ["apps/cli/src/index.ts"],
    evidence_bundle_ids: ["evidence_1"],
    patch_plan_ids: ["patch_plan_1"],
    patch_validation_report_ids: ["patch_validation_1"],
    patch_artifact_ids: ["patch_artifact_1"],
    scope_expansion_request_ids: ["scope_1"],
    scope_expansion_requests: [{
      request: {
        request_id: "scope_1",
        plan_id: "repo_plan_test",
        node_id: "verify_repo",
        work_order_id: "work_order_1",
        reason: "Read status renderer to repair output.",
        requested_files: ["apps/cli/src/index.ts"],
        requested_capabilities: ["repo.read_file"],
        requested_verification_commands: ["npm_run_typecheck"],
        requested_risk_level: "read",
        evidence_refs: ["verification_1"],
        latest_failure_refs: ["verification_1"],
        status: "pending_approval",
        created_at: now,
      },
      approval_request_id: "approval_scope_1",
      approval_status: "requested",
      resume_status: "not_ready",
      suggested_approve_command: "open-lagrange repo scope approve scope_1 --reason \"Allow reading status renderer\"",
      suggested_reject_command: "open-lagrange repo scope reject scope_1 --reason \"Keep task limited\"",
    }],
    verification_report_ids: ["verification_1"],
    repair_attempt_ids: ["repair_1"],
    model_call_artifact_refs: ["model_call_1"],
    review_report_id: "review_1",
    final_patch_artifact_id: "patch_artifact_1",
    errors: [],
    warnings: [],
    created_at: now,
    updated_at: now,
  };
}

function evidence() {
  return {
    evidence_bundle_id: "evidence_1",
    plan_id: "repo_plan_test",
    node_id: "inspect_repo",
    repo_root: "/repo",
    worktree_path: "/repo/.open-lagrange/worktrees/repo_plan_test",
    files: [{ path: "apps/cli/src/index.ts", sha256: "b".repeat(64), excerpt: "status renderer", reason: "CLI status output", line_start: 1, line_end: 20 }],
    file_excerpts: [],
    findings: [{ finding_id: "finding_1", kind: "entrypoint", summary: "CLI status renderer found.", source_ref: "apps/cli/src/index.ts" }],
    artifact_id: "evidence_1",
    created_at: now,
    file_hashes: { "apps/cli/src/index.ts": "b".repeat(64) },
    search_results: [],
    notes: ["bounded evidence"],
  };
}

function patchPlan() {
  return {
    patch_plan_id: "patch_plan_1",
    plan_id: "repo_plan_test",
    node_id: "patch_repo",
    summary: "Add readable repository status output.",
    rationale: "Developers need concise status.",
    evidence_refs: ["evidence_1"],
    operations: [{ operation_id: "op_1", kind: "insert_after", relative_path: "apps/cli/src/index.ts", anchor: "repo.command(\"status\")", content: "formatRepositoryStatus(view)", rationale: "Use repository status formatter." }],
    expected_changed_files: ["apps/cli/src/index.ts"],
    verification_command_ids: ["npm_run_typecheck"],
    preconditions: [],
    risk_level: "write",
    approval_required: true,
    requires_scope_expansion: false,
  };
}

function patchArtifact() {
  return {
    patch_artifact_id: "patch_artifact_1",
    patch_plan_id: "patch_plan_1",
    plan_id: "repo_plan_test",
    node_id: "patch_repo",
    changed_files: ["apps/cli/src/index.ts"],
    unified_diff: "diff --git a/apps/cli/src/index.ts b/apps/cli/src/index.ts\n+formatRepositoryStatus(view)\n",
    before_hashes: { "apps/cli/src/index.ts": "b".repeat(64) },
    after_hashes: { "apps/cli/src/index.ts": "c".repeat(64) },
    apply_status: "applied",
    errors: [],
    artifact_id: "patch_artifact_1",
    created_at: now,
  };
}

function verificationReport() {
  return {
    verification_report_id: "verification_1",
    plan_id: "repo_plan_test",
    node_id: "verify_repo",
    command_results: [{ command_id: "npm_run_typecheck", exit_code: 2, status: "failed", stdout_preview: "", stderr_preview: "JSON output still included text prefix.", duration_ms: 100, truncated: false, raw_artifact_id: "raw_log_1" }],
    passed: false,
    failures: [{ command_id: "npm_run_typecheck", summary: "JSON output still included text prefix.", stderr_preview: "JSON output still included text prefix." }],
    artifact_id: "verification_1",
    created_at: now,
  };
}

function repairAttempt() {
  return {
    repair_attempt_id: "repair_1",
    plan_id: "repo_plan_test",
    node_id: "repair_repo",
    attempt: 1,
    failure_summary: "JSON output still included text prefix.",
    status: "pending",
    decision: { decision: "repair_within_plan", reason: "Adjust output branch.", repair_work_order_id: "repair_work_order_1" },
    created_at: now,
  };
}

function reviewReport() {
  return {
    review_report_id: "review_1",
    plan_id: "repo_plan_test",
    status: "completed_with_warnings",
    title: "Repository review",
    summary: "Patch changes CLI repository status output.",
    changed_files: ["apps/cli/src/index.ts"],
    verification_summary: "Typecheck failed before repair.",
    risk_notes: ["CLI output changed."],
    followups: ["Re-run verification after repair."],
    final_patch_artifact_id: "patch_artifact_1",
    artifact_id: "review_1",
    created_at: now,
  };
}

function writeJson(root: string, name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
  return path;
}
