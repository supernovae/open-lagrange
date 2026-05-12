import { listArtifacts, listArtifactsForPlan, type ArtifactSummary } from "../artifacts/index.js";
import type { ModelCallSummary, RunSnapshot } from "../runs/run-snapshot.js";
import { buildRunSnapshot } from "../runs/run-snapshot-builder.js";
import type { StructuredError } from "../schemas/open-cot.js";
import type { NextAction } from "../runs/run-next-action.js";
import { buildRepositoryArtifactView, type EvidenceBundleSummary, type FinalPatchSummary, type PatchArtifactSummary, type PatchPlanSummary, type RepairAttemptSummary, type RepositoryChangedFileView, type RepositoryDeniedFileView, type RepositoryFileView, type ReviewReportSummary, type ScopeExpansionRequestSummary, type VerificationReportSummary } from "./repository-artifact-view.js";
import { repositoryNextActions } from "./repository-next-actions.js";
import { readRepositoryPlanStatus, type RepositoryPlanStatus } from "./repository-status.js";

export type RepositoryRunStatus = "queued" | "running" | "requires_approval" | "yielded" | "failed" | "completed" | "cancelled";
export type RepositoryRunPhase = "planning" | "inspecting" | "collecting_evidence" | "generating_patch_plan" | "validating_patch" | "applying_patch" | "verifying" | "repairing" | "reviewing" | "exporting_patch" | "completed";
export type RepositoryPhaseStatus = "pending" | "running" | "completed" | "failed" | "yielded" | "skipped";

export interface RepositoryPhaseView {
  readonly phase_id: string;
  readonly label: string;
  readonly status: RepositoryPhaseStatus;
  readonly summary: string;
  readonly artifact_refs: readonly string[];
  readonly next_actions: readonly NextAction[];
}

export interface RepositoryRunView {
  readonly run_id: string;
  readonly plan_id: string;
  readonly repo_root: string;
  readonly worktree_path?: string;
  readonly branch_name?: string;
  readonly base_ref?: string;
  readonly base_commit?: string;
  readonly worktree_status?: string;
  readonly goal: {
    readonly original_prompt?: string;
    readonly interpreted_goal?: string;
    readonly acceptance_criteria: readonly string[];
    readonly non_goals: readonly string[];
    readonly assumptions: readonly string[];
  };
  readonly status: RepositoryRunStatus;
  readonly current_phase?: RepositoryRunPhase;
  readonly phases: readonly RepositoryPhaseView[];
  readonly files: {
    readonly inspected: readonly RepositoryFileView[];
    readonly changed: readonly RepositoryChangedFileView[];
    readonly denied: readonly RepositoryDeniedFileView[];
  };
  readonly evidence: readonly EvidenceBundleSummary[];
  readonly patch_plans: readonly PatchPlanSummary[];
  readonly patch_artifacts: readonly PatchArtifactSummary[];
  readonly verification_reports: readonly VerificationReportSummary[];
  readonly repair_attempts: readonly RepairAttemptSummary[];
  readonly scope_expansion_requests: readonly ScopeExpansionRequestSummary[];
  readonly review_report?: ReviewReportSummary;
  readonly final_patch?: FinalPatchSummary;
  readonly model_calls: readonly ModelCallSummary[];
  readonly artifacts: readonly ArtifactSummary[];
  readonly warnings: readonly string[];
  readonly errors: readonly StructuredError[];
  readonly next_actions: readonly NextAction[];
}

export async function buildRepositoryRunView(input: {
  readonly ref: string;
  readonly snapshot?: RunSnapshot;
  readonly status?: RepositoryPlanStatus;
  readonly artifact_index_path?: string;
}): Promise<RepositoryRunView | undefined> {
  const snapshot = input.snapshot ?? await safeBuildSnapshot(input.ref);
  const planId = input.status?.plan_id ?? snapshot?.plan_id ?? planIdFromRef(input.ref);
  const status = input.status ?? (planId ? readRepositoryPlanStatus(planId) : undefined);
  if (!status) return undefined;
  return buildRepositoryRunViewFromStatus({
    status,
    run_id: snapshot?.run_id ?? runIdForPlan(status.plan_id, input.ref),
    ...(snapshot ? { snapshot } : {}),
    ...(input.artifact_index_path ? { artifact_index_path: input.artifact_index_path } : {}),
  });
}

export function buildRepositoryRunViewFromStatus(input: {
  readonly status: RepositoryPlanStatus;
  readonly run_id?: string;
  readonly snapshot?: RunSnapshot;
  readonly artifact_index_path?: string;
}): RepositoryRunView {
  const status = input.status;
  const runId = input.run_id ?? `repo_${status.plan_id}`;
  const artifacts = repositoryArtifacts(status.plan_id, status.artifact_refs, input.snapshot, input.artifact_index_path);
  const parsed = buildRepositoryArtifactView({ plan_id: status.plan_id, artifacts, ...(input.artifact_index_path ? { artifact_index_path: input.artifact_index_path } : {}) });
  const changed = changedFiles(status, parsed.patch_artifacts);
  const inspected = dedupeByPath(parsed.evidence.flatMap((bundle) => bundle.files));
  const scopeRequests = status.scope_expansion_requests.map((request) => ({
    request_id: request.request.request_id,
    approval_request_id: request.approval_request_id,
    approval_status: request.approval_status,
    reason: request.request.reason,
    requested_files: request.request.requested_files ?? [],
    requested_capabilities: request.request.requested_capabilities ?? [],
    requested_verification_commands: request.request.requested_verification_commands ?? [],
    ...(request.request.requested_risk_level ? { requested_risk_level: request.request.requested_risk_level } : {}),
    evidence_refs: request.request.evidence_refs,
    latest_failure_refs: request.request.latest_failure_refs ?? [],
    suggested_approve_command: request.suggested_approve_command,
    suggested_reject_command: request.suggested_reject_command,
    ...(request.suggested_resume_command ? { suggested_resume_command: request.suggested_resume_command } : {}),
  }));
  const finalPatchId = status.final_patch_artifact_id ?? parsed.final_patch?.artifact_id;
  const phase = currentPhase(status);
  const nextActions = [
    ...repositoryNextActions({ plan_id: status.plan_id, run_id: runId, status, ...(finalPatchId ? { final_patch_artifact_id: finalPatchId } : {}) }),
    ...(input.snapshot?.next_actions ?? []),
  ];
  const errors = [
    ...(input.snapshot?.errors ?? []),
    ...status.errors.map((message, index) => ({
      code: "MCP_EXECUTION_FAILED" as const,
      message,
      observed_at: status.updated_at,
      details: { index },
    })),
  ];
  const phases = buildRepositoryPhases({ status, artifacts, parsed, next_actions: nextActions });
  return {
    run_id: runId,
    plan_id: status.plan_id,
    repo_root: status.worktree_session?.repo_root ?? "",
    ...(status.worktree_session?.worktree_path ? { worktree_path: status.worktree_session.worktree_path } : {}),
    ...(status.worktree_session?.branch_name ? { branch_name: status.worktree_session.branch_name } : {}),
    ...(status.worktree_session?.base_ref ? { base_ref: status.worktree_session.base_ref } : {}),
    ...(status.worktree_session?.base_commit ? { base_commit: status.worktree_session.base_commit } : {}),
    ...(status.worktree_session?.status ? { worktree_status: status.worktree_session.status } : {}),
    goal: goalFromStatus(status),
    status: runStatus(status),
    ...(phase ? { current_phase: phase } : {}),
    phases,
    files: {
      inspected,
      changed,
      denied: scopeRequests.flatMap((request) => request.requested_files.map((path) => ({ path, reason: request.reason }))),
    },
    evidence: parsed.evidence,
    patch_plans: parsed.patch_plans,
    patch_artifacts: parsed.patch_artifacts,
    verification_reports: parsed.verification_reports,
    repair_attempts: parsed.repair_attempts,
    scope_expansion_requests: scopeRequests,
    ...(parsed.review_report ? { review_report: parsed.review_report } : {}),
    ...(parsed.final_patch ? { final_patch: parsed.final_patch } : {}),
    model_calls: input.snapshot?.model_calls ?? status.model_call_artifact_refs.map((artifact_id) => ({
      artifact_id,
      title: "Model call",
      summary: "Repository model-call telemetry artifact.",
      role: "repository",
      model: status.model_calls_summary?.models_used.join(", ") || "unknown",
    })),
    artifacts,
    warnings: status.warnings,
    errors,
    next_actions: uniqueActions(nextActions),
  };
}

function buildRepositoryPhases(input: {
  readonly status: RepositoryPlanStatus;
  readonly artifacts: readonly ArtifactSummary[];
  readonly parsed: ReturnType<typeof buildRepositoryArtifactView>;
  readonly next_actions: readonly NextAction[];
}): readonly RepositoryPhaseView[] {
  const current = currentPhase(input.status);
  const failed = input.status.status === "failed";
  const yielded = input.status.status === "yielded";
  const phase = (phase_id: string, label: string, phaseKey: RepositoryRunPhase, completed: boolean, artifactRefs: readonly string[], summary: string): RepositoryPhaseView => {
    const isCurrent = current === phaseKey;
    return {
      phase_id,
      label,
      status: isCurrent && failed ? "failed" : isCurrent && yielded ? "yielded" : isCurrent ? "running" : completed ? "completed" : "pending",
      summary,
      artifact_refs: artifactRefs,
      next_actions: isCurrent ? input.next_actions : [],
    };
  };
  return [
    phase("goal_framed", "Goal framed", "planning", Boolean(input.status.plan_state), input.status.artifact_refs.filter((ref) => ref.startsWith("planfile_")), "The repository goal was captured in a Planfile."),
    phase("worktree_created", "Worktree created", "inspecting", Boolean(input.status.worktree_session), input.status.worktree_session ? [input.status.worktree_session.worktree_id] : [], "An isolated worktree was prepared for repository changes."),
    phase("evidence_collected", "Evidence collected", "collecting_evidence", input.parsed.evidence.length > 0, input.status.evidence_bundle_ids, `${input.parsed.evidence.flatMap((bundle) => bundle.files).length} file(s) inspected.`),
    phase("patch_planned", "Patch planned", "generating_patch_plan", input.parsed.patch_plans.length > 0, input.status.patch_plan_ids, `${input.parsed.patch_plans.at(-1)?.operations.length ?? 0} operation(s) proposed.`),
    phase("patch_validated", "Patch validated", "validating_patch", input.status.patch_validation_report_ids.length > 0 || input.parsed.patch_artifacts.length > 0, input.status.patch_validation_report_ids, "PatchPlan validation completed or patch artifact was produced."),
    phase("patch_applied", "Patch applied", "applying_patch", input.parsed.patch_artifacts.some((artifact) => artifact.apply_status === "applied"), input.status.patch_artifact_ids, `${input.status.changed_files.length} changed file(s) recorded.`),
    phase("verification_run", "Verification run", "verifying", input.parsed.verification_reports.length > 0, input.status.verification_report_ids, `${input.parsed.verification_reports.at(-1)?.command_results.length ?? 0} command(s) recorded.`),
    phase("repair_attempted", "Repair attempted", "repairing", input.parsed.repair_attempts.length > 0, input.status.repair_attempt_ids, `${input.parsed.repair_attempts.length} repair attempt(s).`),
    phase("review_generated", "Review generated", "reviewing", Boolean(input.parsed.review_report), input.status.review_report_id ? [input.status.review_report_id] : [], input.parsed.review_report?.summary ?? "Review report is pending."),
    phase("final_patch_exported", "Final patch exported", "exporting_patch", Boolean(input.status.final_patch_artifact_id || input.parsed.final_patch), input.status.final_patch_artifact_id ? [input.status.final_patch_artifact_id] : [], "Final patch artifact is ready for export."),
  ];
}

function repositoryArtifacts(planId: string, artifactRefs: readonly string[], snapshot: RunSnapshot | undefined, indexPath: string | undefined): readonly ArtifactSummary[] {
  const indexed = listArtifacts(indexPath);
  const byId = new Map<string, ArtifactSummary>();
  for (const artifact of listArtifactsForPlan(planId, indexPath)) byId.set(artifact.artifact_id, artifact);
  for (const artifact of indexed) {
    if (artifactRefs.includes(artifact.artifact_id)) byId.set(artifact.artifact_id, artifact);
  }
  for (const artifact of snapshot?.artifacts ?? []) {
    const full = indexed.find((candidate) => candidate.artifact_id === artifact.artifact_id);
    if (full) byId.set(full.artifact_id, full);
  }
  return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.artifact_id.localeCompare(right.artifact_id));
}

function goalFromStatus(status: RepositoryPlanStatus): RepositoryRunView["goal"] {
  const markdown = status.plan_state?.markdown_projection ?? "";
  const originalPrompt = extractMarkdownField(markdown, "Original prompt");
  const interpretedGoal = extractMarkdownField(markdown, "Interpreted goal") ?? status.plan_state?.plan_id;
  return {
    ...(originalPrompt ? { original_prompt: originalPrompt } : {}),
    ...(interpretedGoal ? { interpreted_goal: interpretedGoal } : {}),
    acceptance_criteria: extractMarkdownList(markdown, "Acceptance Criteria"),
    non_goals: extractMarkdownList(markdown, "Non-Goals"),
    assumptions: extractMarkdownList(markdown, "Assumptions"),
  };
}

function currentPhase(status: RepositoryPlanStatus): RepositoryRunPhase | undefined {
  const node = status.current_node;
  if (status.status === "completed") return "completed";
  if (!node) return status.status === "pending" ? "planning" : undefined;
  if (node === "frame_goal" || node === "design_change") return "planning";
  if (node === "inspect_repo") return "collecting_evidence";
  if (node === "patch_repo") return status.patch_plan_ids.length > 0 ? "applying_patch" : "generating_patch_plan";
  if (node === "verify_repo") return "verifying";
  if (node === "repair_repo") return "repairing";
  if (node === "review_repo") return "reviewing";
  if (node === "export_patch") return "exporting_patch";
  return "planning";
}

function runStatus(status: RepositoryPlanStatus): RepositoryRunStatus {
  if (status.status === "pending") return "queued";
  if (status.status === "yielded" && status.scope_expansion_requests.some((request) => request.approval_status === "requested")) return "requires_approval";
  return status.status;
}

function changedFiles(status: RepositoryPlanStatus, patchArtifacts: readonly PatchArtifactSummary[]): readonly RepositoryChangedFileView[] {
  const paths = [...status.changed_files, ...patchArtifacts.flatMap((artifact) => artifact.changed_files)];
  return [...new Set(paths)].sort().map((path) => {
    const artifactRef = patchArtifacts.find((artifact) => artifact.changed_files.includes(path))?.artifact_id;
    return {
      path,
      ...(artifactRef ? { artifact_ref: artifactRef } : {}),
    };
  });
}

function dedupeByPath(files: readonly RepositoryFileView[]): readonly RepositoryFileView[] {
  const byPath = new Map<string, RepositoryFileView>();
  for (const file of files) byPath.set(file.path, file);
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function uniqueActions(actions: readonly NextAction[]): readonly NextAction[] {
  const byId = new Map<string, NextAction>();
  for (const action of actions) byId.set(action.action_id, action);
  return [...byId.values()];
}

function runIdForPlan(planId: string, ref: string): string {
  if (ref.startsWith("run_") || ref.startsWith("repo_")) return ref;
  return `repo_${planId}`;
}

function planIdFromRef(ref: string): string | undefined {
  if (ref.startsWith("repo_")) return ref.slice("repo_".length);
  if (readRepositoryPlanStatus(ref)) return ref;
  return undefined;
}

async function safeBuildSnapshot(runId: string): Promise<RunSnapshot | undefined> {
  try {
    return await buildRunSnapshot({ run_id: runId });
  } catch {
    return undefined;
  }
}

function extractMarkdownField(markdown: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\*\\*${escaped}:\\*\\*\\s*(.+)`, "i").exec(markdown);
  return match?.[1]?.trim();
}

function extractMarkdownList(markdown: string, heading: string): readonly string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(\\n##\\s+|$)`, "i").exec(markdown);
  if (!match?.[1]) return [];
  return match[1].split("\n").map((line) => line.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean);
}
