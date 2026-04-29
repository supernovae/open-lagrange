import { stableHash } from "../util/hash.js";
import { buildPackExecutionContext } from "../capability-registry/context.js";
import { executeCapabilityThroughRegistry } from "../capability-registry/registry.js";
import { createArtifactRef } from "../planning/plan-artifacts.js";
import type { PlanNodeHandler } from "../planning/plan-runner.js";
import type { WorkOrder } from "../planning/work-order.js";
import { RepositoryFileInfo, RepositoryFileRead, RepositorySearchMatch, VerificationReport, ReviewReport, DiffReport, type RepositoryWorkspace } from "../schemas/repository.js";
import { PatchPlan as LegacyPatchPlan } from "../schemas/patch-plan.js";
import type { DelegationContext } from "../schemas/delegation.js";
import { createEvidenceBundle, EvidenceBundle } from "./evidence-bundle.js";
import { RepositoryPatchArtifact } from "./patch-artifact.js";
import { RepositoryPatchPlan } from "./patch-plan.js";
import { validateRepositoryPatchPlan } from "./patch-validator.js";
import { chooseModelForRole } from "./model-router.js";
import { nextRepairAttempt, type RepairAttempt } from "./repair-loop.js";

export interface RepositoryWorkOrderHandlerOptions {
  readonly workspace: RepositoryWorkspace;
  readonly delegation_context: DelegationContext;
  readonly task_run_id: string;
  readonly snapshot_id: string;
  readonly evidence?: EvidenceBundle;
  readonly create_patch_plan?: (input: {
    readonly work_order: WorkOrder;
    readonly evidence: EvidenceBundle;
    readonly plan_id: string;
    readonly node_id: string;
  }) => RepositoryPatchPlan;
  readonly on_artifact?: (artifact: RepositoryHandlerArtifact) => void;
}

export type RepositoryHandlerArtifact =
  | { readonly kind: "evidence_bundle"; readonly artifact: EvidenceBundle }
  | { readonly kind: "patch_plan"; readonly artifact: RepositoryPatchPlan }
  | { readonly kind: "patch_artifact"; readonly artifact: RepositoryPatchArtifact }
  | { readonly kind: "verification_report"; readonly artifact: VerificationReport }
  | { readonly kind: "review_report"; readonly artifact: ReviewReport }
  | { readonly kind: "repair_attempt"; readonly artifact: RepairAttempt };

export function createRepositoryWorkOrderHandlers(options: RepositoryWorkOrderHandlerOptions): Record<string, PlanNodeHandler> {
  const state: { evidence?: EvidenceBundle; patch_artifact?: RepositoryPatchArtifact; verification?: VerificationReport; repair_attempts: RepairAttempt[] } = {
    ...(options.evidence ? { evidence: options.evidence } : {}),
    repair_attempts: [],
  };
  return {
    frame: async () => ({ status: "completed" }),
    approval: async () => ({ status: "skipped" }),
    inspect: async (workOrder, context) => {
      const evidence = await inspectRepository(workOrder, context.plan.plan_id, context.node.id, options);
      state.evidence = evidence;
      options.on_artifact?.({ kind: "evidence_bundle", artifact: evidence });
      return {
        status: "completed",
        artifacts: [createArtifactRef({
          artifact_id: evidence.evidence_bundle_id,
          kind: "evidence_bundle",
          path_or_uri: `memory://${evidence.evidence_bundle_id}`,
          summary: `${evidence.file_excerpts.length} file excerpt(s), ${evidence.search_results.length} search result(s)`,
          created_at: evidence.created_at,
        })],
      };
    },
    design: async (_workOrder, _context) => {
      chooseModelForRole("planner_strong");
      return { status: "completed" };
    },
    patch: async (workOrder, context) => {
      if (!state.evidence) return { status: "failed", errors: ["Patch node requires an EvidenceBundle."] };
      if (context.node.acceptance_refs.length === 0) return { status: "failed", errors: ["Patch node must reference acceptance criteria."] };
      const patchPlan = options.create_patch_plan?.({
        work_order: workOrder,
        evidence: state.evidence,
        plan_id: context.plan.plan_id,
        node_id: context.node.id,
      }) ?? deterministicRepositoryPatchPlan(workOrder, state.evidence);
      options.on_artifact?.({ kind: "patch_plan", artifact: patchPlan });
      const validation = validateRepositoryPatchPlan(options.workspace, patchPlan);
      if (!validation.ok) return { status: "failed", errors: validation.errors };
      const legacyPlan = legacyPatchPlanFromRepositoryPlan(patchPlan, state.evidence);
      await executeCapabilityThroughRegistry({
        endpoint_id: "open-lagrange.repository",
        capability_name: "repo.apply_patch",
        arguments: { patch_plan: legacyPlan, idempotency_key: legacyPlan.idempotency_key },
        context: repoContext(options, `repo-plan-apply-${patchPlan.patch_plan_id}`),
      });
      const diff = DiffReport.parse((await executeCapabilityThroughRegistry({
        endpoint_id: "open-lagrange.repository",
        capability_name: "repo.get_diff",
        arguments: { paths: patchPlan.expected_changed_files },
        context: repoContext(options, `repo-plan-diff-${patchPlan.patch_plan_id}`),
      })).output);
      const artifact = RepositoryPatchArtifact.parse({
        patch_artifact_id: `patch_artifact_${stableHash({ patchPlan, diff }).slice(0, 18)}`,
        patch_plan_id: patchPlan.patch_plan_id,
        changed_files: diff.changed_files,
        unified_diff: diff.diff_text,
        before_hashes: state.evidence.file_hashes,
        after_hashes: {},
        apply_status: "applied",
        errors: [],
        created_at: new Date().toISOString(),
      });
      state.patch_artifact = artifact;
      options.on_artifact?.({ kind: "patch_artifact", artifact });
      return {
        status: "completed",
        artifacts: [createArtifactRef({
          artifact_id: artifact.patch_artifact_id,
          kind: "patch_artifact",
          path_or_uri: `memory://${artifact.patch_artifact_id}`,
          summary: `${artifact.changed_files.length} changed file(s)`,
          created_at: artifact.created_at,
        })],
      };
    },
    verify: async (_workOrder, context) => {
      if (!state.patch_artifact) return { status: "failed", errors: ["Verification requires a PatchArtifact."] };
      const commandIds = context.node.verification_command_ids ?? context.plan.verification_policy.allowed_command_ids;
      const results = [];
      for (const command_id of commandIds.length > 0 ? commandIds : ["npm_run_typecheck"]) {
        const partial = VerificationReport.parse((await executeCapabilityThroughRegistry({
          endpoint_id: "open-lagrange.repository",
          capability_name: "repo.run_verification",
          arguments: { command_id },
          context: repoContext(options, `repo-plan-verify-${context.node.id}-${command_id}`, 120_000),
        })).output);
        results.push(...partial.results);
      }
      const report = VerificationReport.parse({
        results,
        passed: results.every((result) => result.exit_code === 0),
        summary: results.map((result) => `${result.command}: ${result.exit_code}`).join("; "),
      });
      state.verification = report;
      options.on_artifact?.({ kind: "verification_report", artifact: report });
      return {
        status: "completed",
        artifacts: [createArtifactRef({
          artifact_id: `verification_${stableHash(report).slice(0, 18)}`,
          kind: "verification_report",
          path_or_uri: `memory://verification_${context.node.id}`,
          summary: report.summary,
          created_at: new Date().toISOString(),
        })],
      };
    },
    repair: async (_workOrder, context) => {
      if (!state.patch_artifact || !state.verification) return { status: "skipped" };
      if (state.verification.passed) return { status: "skipped" };
      chooseModelForRole("repair_small");
      const repair = nextRepairAttempt({
        plan_id: context.plan.plan_id,
        node_id: context.node.id,
        previous_attempts: state.repair_attempts,
        verification_report: state.verification,
        now: new Date().toISOString(),
      });
      state.repair_attempts.push(repair);
      options.on_artifact?.({ kind: "repair_attempt", artifact: repair });
      return {
        status: "yielded",
        errors: [repair.status === "yielded" ? repair.failure_summary : "Repair work order recorded; patch expansion requires a repository patch producer."],
        artifacts: [createArtifactRef({
          artifact_id: repair.repair_attempt_id,
          kind: "raw_log",
          path_or_uri: `memory://${repair.repair_attempt_id}`,
          summary: repair.failure_summary,
          created_at: repair.created_at,
        })],
      };
    },
    review: async (_workOrder, context) => {
      if (!state.patch_artifact || !state.verification) return { status: "failed", errors: ["Review requires PatchArtifact and VerificationReport."] };
      chooseModelForRole("reviewer_medium");
      const report = ReviewReport.parse((await executeCapabilityThroughRegistry({
        endpoint_id: "open-lagrange.repository",
        capability_name: "repo.create_review_report",
        arguments: {
          goal: context.plan.goal_frame.interpreted_goal,
          changed_files: state.patch_artifact.changed_files,
          diff_summary: `${state.patch_artifact.changed_files.length} changed file(s)`,
          verification_results: state.verification.results,
        },
        context: repoContext(options, `repo-plan-review-${context.node.id}`),
      })).output);
      options.on_artifact?.({ kind: "review_report", artifact: report });
      return {
        status: "completed",
        artifacts: [createArtifactRef({
          artifact_id: `review_${stableHash(report).slice(0, 18)}`,
          kind: "review_report",
          path_or_uri: `memory://review_${context.node.id}`,
          summary: report.pr_summary,
          created_at: new Date().toISOString(),
        })],
      };
    },
    finalize: async () => ({ status: "completed" }),
  };
}

async function inspectRepository(
  workOrder: WorkOrder,
  planId: string,
  nodeId: string,
  options: RepositoryWorkOrderHandlerOptions,
): Promise<EvidenceBundle> {
  const context = repoContext(options, `repo-plan-inspect-${nodeId}`);
  const files = RepositoryFileInfo.array().parse((await executeCapabilityThroughRegistry({
    endpoint_id: "open-lagrange.repository",
    capability_name: "repo.list_files",
    arguments: { relative_path: ".", max_results: options.workspace.max_files_per_task },
    context,
  })).output);
  const selected = files.slice(0, Math.min(6, options.workspace.max_files_per_task));
  const file_excerpts = [];
  for (const file of selected) {
    file_excerpts.push(RepositoryFileRead.parse((await executeCapabilityThroughRegistry({
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.read_file",
      arguments: { relative_path: file.relative_path },
      context: repoContext(options, `repo-plan-read-${file.relative_path}`),
    })).output));
  }
  const search_results = RepositorySearchMatch.array().parse((await executeCapabilityThroughRegistry({
    endpoint_id: "open-lagrange.repository",
    capability_name: "repo.search_text",
    arguments: { query: workOrder.objective, max_results: 12 },
    context: repoContext(options, `repo-plan-search-${nodeId}`),
  })).output);
  return createEvidenceBundle({
    evidence_bundle_id: `evidence_${stableHash({ planId, nodeId, files: file_excerpts.map((file) => file.sha256) }).slice(0, 18)}`,
    plan_id: planId,
    node_id: nodeId,
    goal: workOrder.objective,
    file_excerpts,
    findings: search_results.length > 0 ? ["Search found potentially relevant repository context."] : ["No direct search matches were found."],
    search_results,
    notes: ["Evidence was collected through repository capabilities."],
    artifact_refs: [],
    created_at: new Date().toISOString(),
  });
}

function deterministicRepositoryPatchPlan(workOrder: WorkOrder, evidence: EvidenceBundle) {
  const target = evidence.file_excerpts[0];
  const relative_path = target?.relative_path ?? "README.md";
  return RepositoryPatchPlan.parse({
    patch_plan_id: `repo_patch_${stableHash({ workOrder, evidence: evidence.evidence_bundle_id }).slice(0, 18)}`,
    plan_id: workOrder.plan_id,
    node_id: workOrder.node_id,
    summary: `Apply bounded repository change for ${workOrder.objective}`,
    rationale: "Deterministic fallback keeps patch planning bounded to collected evidence.",
    evidence_refs: [evidence.evidence_bundle_id],
    operations: [{
      operation_id: "op_append_note",
      kind: "insert_after",
      relative_path,
      ...(target ? { expected_sha256: target.sha256 } : {}),
      content: "\n\n<!-- Open Lagrange repository plan executed. -->\n",
      rationale: "Small deterministic patch for the repository plan execution path.",
    }],
    expected_changed_files: [relative_path],
    verification_command_ids: workOrder.constraints.filter((item) => item.startsWith("verification_command:")).map((item) => item.slice("verification_command:".length)),
    preconditions: target ? [`${relative_path} sha256 is ${target.sha256}`] : [`${relative_path} may be created`],
    risk_level: "write",
    approval_required: true,
  });
}

function legacyPatchPlanFromRepositoryPlan(patchPlan: RepositoryPatchPlan, evidence: EvidenceBundle) {
  const files = patchPlan.operations.map((operation) => {
    const read = evidence.file_excerpts.find((file) => file.relative_path === operation.relative_path);
    return {
      relative_path: operation.relative_path,
      operation: read ? "modify" as const : "create" as const,
      ...(operation.expected_sha256 ? { expected_sha256: operation.expected_sha256 } : {}),
      ...(operation.kind === "insert_after" && read ? { append_text: operation.content ?? "" } : { full_replacement: operation.content ?? "" }),
      rationale: operation.rationale,
    };
  });
  return LegacyPatchPlan.parse({
    patch_plan_id: patchPlan.patch_plan_id,
    goal: patchPlan.summary,
    summary: patchPlan.summary,
    files,
    expected_preconditions: patchPlan.preconditions,
    risk_level: patchPlan.risk_level,
    requires_approval: patchPlan.approval_required,
    idempotency_key: `idem_${stableHash(patchPlan).slice(0, 24)}`,
  });
}

function repoContext(options: RepositoryWorkOrderHandlerOptions, idempotency_key: string, timeout_ms = 30_000) {
  return buildPackExecutionContext({
    delegation_context: options.delegation_context,
    capability_snapshot_id: options.snapshot_id,
    project_id: options.delegation_context.project_id,
    workspace_id: options.workspace.workspace_id,
    task_run_id: options.task_run_id,
    trace_id: options.delegation_context.trace_id,
    idempotency_key,
    policy_decision: { outcome: "allow" },
    execution_bounds: {},
    timeout_ms,
    runtime_config: { workspace: options.workspace },
  });
}
