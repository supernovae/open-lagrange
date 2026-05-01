import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRepositoryReviewReport } from "../src/capability-packs/repository/executor.js";
import { createCapabilitySnapshotForTask } from "../src/capability-registry/registry.js";
import { WorkOrder } from "../src/planning/work-order.js";
import { createEvidenceBundle } from "../src/repository/evidence-bundle.js";
import { loadRepositoryWorkspace } from "../src/repository/workspace.js";
import { cleanupWorktreeSession, createWorktreeSession } from "../src/repository/worktree-manager.js";
import { exportFinalPatch } from "../src/repository/patch-exporter.js";
import { validateRepositoryPatchPlan } from "../src/repository/patch-validator.js";
import { nextRepairAttempt } from "../src/repository/repair-loop.js";
import { createRepositoryPlanfile, applyRepositoryPlanfile, approveRepositoryScopeRequest, resumeRepositoryPlan, listRepositoryModelCalls } from "../src/repository/repository-plan-control.js";
import { runVerificationPolicy } from "../src/repository/verification-runner.js";
import { generatePatchPlanFromEvidence, patchPlanContextSummary } from "../src/repository/model-patch-plan-generator.js";
import { modelProviderUnavailable } from "../src/repository/patch-plan-generation-errors.js";
import { normalizeModelPatchPlanOutput } from "../src/repository/patch-plan-output-schema.js";
import type { RepositoryPatchPlan } from "../src/repository/patch-plan.js";
import { normalizeScopeExpansionRequest, scopeExpansionRequestDigest } from "../src/repository/scope-expansion.js";
import { listBenchmarkScenarios, renderBenchmarkReportMarkdown, runModelRoutingBenchmark } from "../src/evals/index.js";

describe("repository Planfile to patch pipeline", () => {
  it("creates an isolated worktree and keeps the source worktree untouched", () => {
    const root = gitFixture();
    const session = createWorktreeSession({ repo_root: root, plan_id: "repo_plan_test" });
    writeFileSync(join(session.worktree_path, "README.md"), "# Demo\n\nChanged in worktree.\n");

    expect(session.branch_name).toBe("ol/repo_plan_test");
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# Demo\n");
    expect(readFileSync(join(session.worktree_path, "README.md"), "utf8")).toContain("Changed in worktree");

    cleanupWorktreeSession(session);
  });

  it("excludes Open Lagrange internals from final patch export", () => {
    const root = gitFixture();
    const session = createWorktreeSession({ repo_root: root, plan_id: "repo_plan_internal_patch" });
    writeFileSync(join(session.worktree_path, "README.md"), "# Demo\n\nFinal patch.\n");
    mkdirSync(join(session.worktree_path, ".open-lagrange", "runs"), { recursive: true });
    writeFileSync(join(session.worktree_path, ".open-lagrange", "runs", "debug.json"), "{}\n");

    const patch = exportFinalPatch(session);

    expect(patch.changed_files).toEqual(["README.md"]);
    expect(patch.unified_diff).not.toContain(".open-lagrange");
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

  it("rejects missing and ambiguous anchors", () => {
    const root = gitFixture();
    writeFileSync(join(root, "README.md"), "# Demo\nanchor\nanchor\n");
    const workspace = loadRepositoryWorkspace({ repo_root: root, trace_id: "trace-test", dry_run: false });
    const readmeHash = sha(root, "README.md");
    const missing = validateRepositoryPatchPlan(workspace, anchorPatchPlan("missing", readmeHash), {
      allowed_files: ["README.md"],
      denied_files: [],
      allow_full_replacement: true,
      full_replacement_max_bytes: 32000,
      allow_ambiguous_anchors: false,
      allowed_verification_command_ids: ["npm_run_typecheck"],
    });
    const ambiguous = validateRepositoryPatchPlan(workspace, anchorPatchPlan("anchor", readmeHash), {
      allowed_files: ["README.md"],
      denied_files: [],
      allow_full_replacement: true,
      full_replacement_max_bytes: 32000,
      allow_ambiguous_anchors: false,
      allowed_verification_command_ids: ["npm_run_typecheck"],
    });

    expect(missing.errors.join("\n")).toContain("anchor was not found");
    expect(ambiguous.errors.join("\n")).toContain("anchor is ambiguous");
  });

  it("validates model PatchPlan output schema", () => {
    const hash = "a".repeat(64);
    const plan = normalizeModelPatchPlanOutput({
      patch_plan_id: "patch-model",
      plan_id: "plan-test",
      node_id: "patch_repo",
      summary: "Patch README",
      rationale: "Use provided evidence only.",
      evidence_refs: ["evidence-test"],
      operations: [{
        operation_id: "op-1",
        type: "insert_after",
        path: "README.md",
        anchor: "# Demo",
        content: "\n\nUpdated.\n",
        expected_sha256: hash,
        rationale: "Small anchor edit.",
      }],
      expected_changed_files: ["README.md"],
      verification_command_ids: ["npm_run_typecheck"],
      preconditions: [{ kind: "file_hash", path: "README.md", expected_sha256: hash, summary: "README hash matches evidence." }],
      risk_level: "write",
      approval_required: true,
      confidence: 0.7,
      requires_scope_expansion: false,
    });

    expect(plan.operations[0]?.kind).toBe("insert_after");
    expect(plan.operations[0]?.relative_path).toBe("README.md");
  });

  it("keeps PatchPlan generation context evidence-only", () => {
    const root = gitFixture();
    const evidence = testEvidence(root);
    const context = patchPlanContextSummary({
      plan_id: "plan-test",
      node_id: "patch_repo",
      work_order: testWorkOrder(),
      evidence_bundle: evidence,
      allowed_files: ["README.md"],
      denied_files: [".env"],
      acceptance_criteria: ["README updated"],
      non_goals: ["Do not touch secrets"],
      constraints: ["allowed files only"],
      patch_policy: {
        allowed_files: ["README.md"],
        denied_files: [".env"],
        allow_full_replacement: true,
        full_replacement_max_bytes: 32000,
        allow_ambiguous_anchors: false,
        allowed_verification_command_ids: ["npm_run_typecheck"],
      },
      mode: "initial_patch",
      model_role_hint: "implementer_small",
    });

    const text = JSON.stringify(context);
    expect(text).toContain("README.md");
    expect(text).not.toContain("SECRET=1");
    expect(text).not.toContain(".git");
  });

  it("yields when PatchPlan generation has no configured model provider", async () => {
    const original = {
      provider: process.env.OPEN_LAGRANGE_MODEL_PROVIDER,
      key: process.env.OPEN_LAGRANGE_MODEL_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      gateway: process.env.AI_GATEWAY_API_KEY,
    };
    delete process.env.OPEN_LAGRANGE_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.OPEN_LAGRANGE_MODEL_PROVIDER = "openai";
    await expect(generatePatchPlanFromEvidence({
      plan_id: "plan-test",
      node_id: "patch_repo",
      work_order: testWorkOrder(),
      evidence_bundle: testEvidence(gitFixture()),
      allowed_files: ["README.md"],
      denied_files: [],
      acceptance_criteria: ["README updated"],
      non_goals: [],
      constraints: [],
      patch_policy: {
        allowed_files: ["README.md"],
        denied_files: [],
        allow_full_replacement: true,
        full_replacement_max_bytes: 32000,
        allow_ambiguous_anchors: false,
        allowed_verification_command_ids: ["npm_run_typecheck"],
      },
      mode: "initial_patch",
      model_role_hint: "implementer_small",
    })).rejects.toMatchObject({ code: "MODEL_PROVIDER_UNAVAILABLE" });
    restoreEnv(original);
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

  it("rejects verification commands with shell syntax", async () => {
    await expect(runVerificationPolicy({
      plan_id: "plan",
      node_id: "verify",
      cwd: gitFixture(),
      commands: [{
        command_id: "unsafe",
        display_name: "unsafe",
        executable: "npm",
        args: ["run", "typecheck;echo unsafe"],
        timeout_ms: 1_000,
        output_limit_bytes: 1_000,
      }],
      command_ids: ["unsafe"],
    })).rejects.toThrow(/shell syntax/);
  });

  it("generates and applies a durable repository Planfile", async () => {
    const root = gitFixture({ package_json: true });
    const originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = root;
    try {
      const created = await createRepositoryPlanfile({
        repo_root: root,
        goal: "add json output to my cli",
        dry_run: true,
        verification_command_ids: ["npm_run_typecheck"],
        now: "2026-04-30T12:00:00.000Z",
      });

      expect(existsSync(created.path)).toBe(true);
      expect(created.markdown).toContain("flowchart TD");
      expect(created.planfile.nodes.map((node) => node.id)).toContain("export_patch");

      const status = await applyRepositoryPlanfile({
        planfile: created.planfile,
        patch_plan_generator: async (input) => {
          const file = input.evidence_bundle.files.find((item) => item.path === "README.md") ?? input.evidence_bundle.files[0];
          if (!file) throw new Error("Missing evidence file.");
          return {
            patch_plan_id: "patch-model-apply",
            plan_id: input.plan_id,
            node_id: input.node_id,
            summary: "Update README from model PatchPlan",
            rationale: "Use the bounded evidence excerpt.",
            evidence_refs: [input.evidence_bundle.evidence_bundle_id],
            operations: [{
              operation_id: "op-readme",
              kind: "insert_after",
              relative_path: file.path,
              expected_sha256: file.sha256,
              anchor: "# Demo",
              content: "\n\nModel PatchPlan executed.\n",
              rationale: "Small anchor edit.",
            }],
            expected_changed_files: [file.path],
            verification_command_ids: ["npm_run_typecheck"],
            preconditions: [{ kind: "file_hash", path: file.path, expected_sha256: file.sha256, summary: "README hash matches evidence." }],
            risk_level: "write",
            approval_required: false,
            confidence: 0.8,
            requires_scope_expansion: false,
          };
        },
        now: "2026-04-30T12:01:00.000Z",
      });

      expect(status.status).toBe("completed");
      expect(status.worktree_session?.worktree_path).toContain(".open-lagrange/worktrees");
      expect(status.changed_files).toContain("README.md");
      expect(status.evidence_bundle_ids.length).toBeGreaterThan(0);
      expect(status.patch_artifact_ids.length).toBeGreaterThan(0);
      expect(status.verification_report_ids.length).toBeGreaterThan(0);
      expect(status.final_patch_artifact_id).toBeTruthy();
      expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# Demo\n");
    } finally {
      if (originalInitCwd === undefined) delete process.env.INIT_CWD;
      else process.env.INIT_CWD = originalInitCwd;
    }
  });

  it("keeps deterministic planning available and yields clearly without a model route", async () => {
    const root = gitFixture({ package_json: true });
    const deterministic = await createRepositoryPlanfile({
      repo_root: root,
      goal: "update readme",
      dry_run: true,
      planning_mode: "deterministic",
      verification_command_ids: ["npm_run_typecheck"],
      now: "2026-04-30T12:00:00.000Z",
    });

    expect(deterministic.planfile.nodes.map((node) => node.id)).toContain("patch_repo");
    expect(listRepositoryModelCalls(deterministic.planfile.plan_id)).toHaveLength(0);
    await expect(createRepositoryPlanfile({
      repo_root: root,
      goal: "update readme",
      dry_run: true,
      planning_mode: "model",
      verification_command_ids: ["npm_run_typecheck"],
    })).rejects.toThrow(/model route/i);
  });

  it("rejects PatchPlans with unknown evidence refs during apply", async () => {
    const root = gitFixture({ package_json: true });
    const originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = root;
    try {
      const created = await createRepositoryPlanfile({ repo_root: root, goal: "update readme", dry_run: true, verification_command_ids: ["npm_run_typecheck"] });
      const status = await applyRepositoryPlanfile({
        planfile: created.planfile,
        patch_plan_generator: async (input) => ({
          patch_plan_id: "patch-unknown-evidence",
          plan_id: input.plan_id,
          node_id: input.node_id,
          summary: "Invalid evidence",
          rationale: "Test rejection.",
          evidence_refs: ["missing-evidence"],
          operations: [{
            operation_id: "op-readme",
            kind: "insert_after",
            relative_path: "README.md",
            expected_sha256: input.evidence_bundle.files[0]?.sha256 ?? "0".repeat(64),
            anchor: "# Demo",
            content: "\nInvalid.\n",
            rationale: "Test.",
          }],
          expected_changed_files: ["README.md"],
          verification_command_ids: ["npm_run_typecheck"],
          preconditions: [],
          risk_level: "write",
          approval_required: false,
          confidence: 0.1,
          requires_scope_expansion: false,
        }),
      });
      expect(status.status).toBe("yielded");
      expect(status.errors.join("\n")).toContain("unknown evidence");
    } finally {
      if (originalInitCwd === undefined) delete process.env.INIT_CWD;
      else process.env.INIT_CWD = originalInitCwd;
    }
  });

  it("records scope expansion approval requests without applying", async () => {
    const root = gitFixture({ package_json: true });
    const originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = root;
    try {
      const created = await createRepositoryPlanfile({ repo_root: root, goal: "update cli", dry_run: true, verification_command_ids: ["npm_run_typecheck"] });
      const status = await applyRepositoryPlanfile({
        planfile: created.planfile,
        patch_plan_generator: async (input) => ({
          patch_plan_id: "patch-scope",
          plan_id: input.plan_id,
          node_id: input.node_id,
          summary: "Need CLI file",
          rationale: "README evidence is insufficient.",
          evidence_refs: [input.evidence_bundle.evidence_bundle_id],
          operations: [{
            operation_id: "op-cli",
            kind: "insert_after",
            relative_path: "src/cli.ts",
            expected_sha256: "1".repeat(64),
            anchor: "main",
            content: "\n",
            rationale: "Requested file is outside current scope.",
          }],
          expected_changed_files: ["src/cli.ts"],
          verification_command_ids: ["npm_run_typecheck"],
          preconditions: [],
          risk_level: "write",
          approval_required: true,
          confidence: 0.5,
          requires_scope_expansion: true,
          scope_expansion_request: {
            request_id: "scope-request-1",
            plan_id: input.plan_id,
            node_id: input.node_id,
            reason: "Need the CLI entrypoint file.",
            requested_files: ["src/cli.ts"],
            requested_risk_level: "write",
            evidence_refs: [input.evidence_bundle.evidence_bundle_id],
          },
        }),
      });
      expect(status.status).toBe("yielded");
      expect(status.scope_expansion_request_ids).toEqual(["scope-request-1"]);
      expect(status.scope_expansion_requests[0]?.suggested_approve_command).toContain("repo scope approve");
      expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# Demo\n");
    } finally {
      if (originalInitCwd === undefined) delete process.env.INIT_CWD;
      else process.env.INIT_CWD = originalInitCwd;
    }
  });

  it("binds scope expansion approvals to request digests", () => {
    const request = normalizeScopeExpansionRequest({
      request: {
        request_id: "scope-digest",
        plan_id: "plan",
        node_id: "patch_repo",
        reason: "Need CLI file.",
        requested_files: ["src/cli.ts"],
        evidence_refs: ["evidence"],
      },
      plan_id: "plan",
      node_id: "patch_repo",
      work_order_id: "work-order",
      now: "2026-04-30T12:00:00.000Z",
    });
    const changed = normalizeScopeExpansionRequest({
      request: { ...request, requested_files: ["src/other.ts"] },
      plan_id: "plan",
      node_id: "patch_repo",
      work_order_id: "work-order",
      now: "2026-04-30T12:00:00.000Z",
    });

    expect(scopeExpansionRequestDigest(request)).not.toBe(scopeExpansionRequestDigest(changed));
  });

  it("resumes after approved scope expansion and re-collects requested evidence", async () => {
    const root = gitFixture({ package_json: true, cli: true });
    const originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = root;
    let calls = 0;
    try {
      const created = await createRepositoryPlanfile({ repo_root: root, goal: "add json output to cli", dry_run: true, verification_command_ids: ["npm_run_typecheck"] });
      const generator = async (input: Parameters<NonNullable<Parameters<typeof applyRepositoryPlanfile>[0]["patch_plan_generator"]>>[0]): Promise<RepositoryPatchPlan> => {
        calls += 1;
        if (calls === 1) {
          return {
            patch_plan_id: "patch-scope-resume",
            plan_id: input.plan_id,
            node_id: input.node_id,
            summary: "Need CLI file",
            rationale: "Request more scope.",
            evidence_refs: [input.evidence_bundle.evidence_bundle_id],
            operations: [{
              operation_id: "op-cli",
              kind: "insert_after",
              relative_path: "src/cli.ts",
              expected_sha256: "1".repeat(64),
              anchor: "status",
              content: "\n",
              rationale: "Needs approved file.",
            }],
            expected_changed_files: ["src/cli.ts"],
            verification_command_ids: ["npm_run_typecheck"],
            preconditions: [],
            risk_level: "write",
            approval_required: true,
            confidence: 0.5,
            requires_scope_expansion: true,
            scope_expansion_request: {
              request_id: "scope-resume-1",
              plan_id: input.plan_id,
              node_id: input.node_id,
              work_order_id: input.work_order.work_order_id,
              reason: "Need the CLI entrypoint.",
              requested_files: ["src/cli.ts"],
              requested_risk_level: "write",
              evidence_refs: [input.evidence_bundle.evidence_bundle_id],
            },
          };
        }
        const file = input.evidence_bundle.files.find((item) => item.path === "src/cli.ts");
        if (!file) throw new Error("Expected re-collected CLI evidence.");
        return {
          patch_plan_id: "patch-scope-resumed",
          plan_id: input.plan_id,
          node_id: input.node_id,
          summary: "Add JSON option",
          rationale: "Patch approved CLI file.",
          evidence_refs: [input.evidence_bundle.evidence_bundle_id, file.path],
          operations: [{
            operation_id: "op-cli",
            kind: "insert_after",
            relative_path: file.path,
            expected_sha256: file.sha256,
            anchor: "export function status() {",
            content: " return JSON.stringify({ status: 'ok' });",
            rationale: "Small anchor edit.",
          }],
          expected_changed_files: [file.path],
          verification_command_ids: ["npm_run_typecheck"],
          preconditions: [{ kind: "file_hash", path: file.path, expected_sha256: file.sha256, summary: "CLI hash matches evidence." }],
          risk_level: "write",
          approval_required: false,
          confidence: 0.8,
          requires_scope_expansion: false,
        };
      };
      const yielded = await applyRepositoryPlanfile({ planfile: created.planfile, patch_plan_generator: generator });
      expect(yielded.status).toBe("yielded");
      await approveRepositoryScopeRequest({ request_id: "scope-resume-1", reason: "needed for CLI file" });
      const resumed = await resumeRepositoryPlan({ plan_id: created.planfile.plan_id, patch_plan_generator: generator });

      expect(resumed.status).toBe("completed");
      expect(resumed.scope_expansion_requests[0]?.request.status).toBe("applied");
      expect(resumed.evidence_bundle_ids.length).toBeGreaterThan(0);
      expect(resumed.changed_files).toContain("src/cli.ts");
      expect(readFileSync(join(root, "src", "cli.ts"), "utf8")).toContain("return 'ok'");
    } finally {
      if (originalInitCwd === undefined) delete process.env.INIT_CWD;
      else process.env.INIT_CWD = originalInitCwd;
    }
  });

  it("yields before applying when PatchPlan approval is required", async () => {
    const root = gitFixture({ package_json: true });
    const originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = root;
    try {
      const created = await createRepositoryPlanfile({ repo_root: root, goal: "update readme", dry_run: true, verification_command_ids: ["npm_run_typecheck"] });
      const status = await applyRepositoryPlanfile({
        planfile: created.planfile,
        patch_plan_generator: async (input) => {
          const file = input.evidence_bundle.files.find((item) => item.path === "README.md") ?? input.evidence_bundle.files[0];
          if (!file) throw new Error("Missing evidence file.");
          return {
            patch_plan_id: "patch-needs-approval",
            plan_id: input.plan_id,
            node_id: input.node_id,
            summary: "Approval-gated README update",
            rationale: "Test approval pause.",
            evidence_refs: [input.evidence_bundle.evidence_bundle_id],
            operations: [{
              operation_id: "op-readme",
              kind: "insert_after",
              relative_path: file.path,
              expected_sha256: file.sha256,
              anchor: "# Demo",
              content: "\n\nApproval gated.\n",
              rationale: "Small anchor edit.",
            }],
            expected_changed_files: [file.path],
            verification_command_ids: ["npm_run_typecheck"],
            preconditions: [{ kind: "file_hash", path: file.path, expected_sha256: file.sha256, summary: "README hash matches evidence." }],
            risk_level: "write",
            approval_required: true,
            confidence: 0.8,
            requires_scope_expansion: false,
          };
        },
      });
      expect(status.status).toBe("yielded");
      expect(status.artifact_refs.some((ref) => ref.startsWith("approval_"))).toBe(true);
      expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# Demo\n");
    } finally {
      if (originalInitCwd === undefined) delete process.env.INIT_CWD;
      else process.env.INIT_CWD = originalInitCwd;
    }
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

  it("loads benchmark scenarios and renders mock metrics", async () => {
    const scenarios = listBenchmarkScenarios();
    expect(scenarios.length).toBeGreaterThan(0);
    const report = await runModelRoutingBenchmark({
      benchmark_id: "repo-plan-to-patch",
      mode: "mock",
      output_dir: mkdtempSync(join(tmpdir(), "open-lagrange-eval-")),
      now: "2026-04-30T12:00:00.000Z",
    });

    expect(report.metrics.length).toBeGreaterThan(0);
    expect(report.metrics.some((metric) => metric.tokens_input >= 0)).toBe(true);
    expect(renderBenchmarkReportMarkdown(report)).toContain("Repository Plan-to-Patch Benchmark");
  });
});

function gitFixture(options: { readonly package_json?: boolean; readonly cli?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "open-lagrange-plan-patch-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "README.md"), "# Demo\n");
  writeFileSync(join(root, ".gitignore"), ".env\n.open-lagrange/\n");
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  if (options.package_json) {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"process.exit(0)\"",
      },
    }, null, 2));
  }
  if (options.cli) {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "cli.ts"), "export function status() {\n  return 'ok';\n}\n");
  }
  git(root, ["add", "README.md", ".gitignore", ...(options.package_json ? ["package.json"] : []), ...(options.cli ? ["src/cli.ts"] : [])]);
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
    confidence: 0.5,
    requires_scope_expansion: false,
  };
}

function anchorPatchPlan(anchor: string, expected_sha256: string): RepositoryPatchPlan {
  return {
    ...patchPlan("README.md", expected_sha256),
    operations: [{
      operation_id: "op-anchor",
      kind: "insert_after",
      relative_path: "README.md",
      expected_sha256,
      anchor,
      content: "\ninserted\n",
      rationale: "Test anchor operation.",
    }],
  };
}

function testEvidence(root: string) {
  return createEvidenceBundle({
    evidence_bundle_id: "evidence-test",
    plan_id: "plan-test",
    node_id: "inspect_repo",
    repo_root: root,
    worktree_path: root,
    file_reads: [{
      relative_path: "README.md",
      content: readFileSync(join(root, "README.md"), "utf8"),
      sha256: sha(root, "README.md"),
      size: readFileSync(join(root, "README.md")).byteLength,
      truncated: false,
    }],
    findings: [{ finding_id: "finding-1", kind: "documentation", summary: "README evidence.", source_ref: "README.md" }],
    notes: ["test evidence"],
    created_at: "2026-04-30T12:00:00.000Z",
  });
}

function testWorkOrder() {
  return WorkOrder.parse({
    work_order_id: "work-order-test",
    plan_id: "plan-test",
    node_id: "patch_repo",
    phase: "patch",
    objective: "Update README",
    acceptance_criteria: ["README updated"],
    non_goals: [],
    assumptions: [],
    constraints: ["allowed files only"],
    allowed_capability_snapshot: createCapabilitySnapshotForTask({ allowed_capabilities: [], allowed_scopes: [], max_risk_level: "read", now: "2026-04-30T12:00:00.000Z" }),
    input_artifacts: ["evidence-test"],
    required_output_schema: { type: "object" },
    relevant_evidence: ["evidence-test"],
    latest_failures: [],
    max_attempts: 1,
    model_role_hint: "implementer",
  });
}

function restoreEnv(input: { readonly provider?: string; readonly key?: string; readonly openai?: string; readonly gateway?: string }): void {
  if (input.provider === undefined) delete process.env.OPEN_LAGRANGE_MODEL_PROVIDER;
  else process.env.OPEN_LAGRANGE_MODEL_PROVIDER = input.provider;
  if (input.key === undefined) delete process.env.OPEN_LAGRANGE_MODEL_API_KEY;
  else process.env.OPEN_LAGRANGE_MODEL_API_KEY = input.key;
  if (input.openai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = input.openai;
  if (input.gateway === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = input.gateway;
}

function sha(root: string, path: string): string {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}
