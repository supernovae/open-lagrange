import type { Context } from "@hatchet-dev/typescript-sdk";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { deterministicApprovalRequestId, deterministicReconciliationId } from "../ids/deterministic-ids.js";
import { observation, structuredError } from "../reconciliation/records.js";
import { PatchPlan, PatchPreview, type PatchPreview as PatchPreviewType } from "../schemas/patch-plan.js";
import { CapabilitySnapshot } from "../schemas/capabilities.js";
import { CognitiveArtifact } from "../schemas/open-cot.js";
import { RepositoryTaskInput, RepositoryTaskStatus, RepositoryWorkspace, VerificationReport, DiffReport, ReviewReport, type RepositoryTaskInput as RepositoryTaskInputType, type RepositoryTaskStatus as RepositoryTaskStatusType, type VerificationReport as VerificationReportType, type ReviewReport as ReviewReportType } from "../schemas/repository.js";
import { TaskReconciliationResult, type ApprovalRequest, type TaskReconciliationResult as TaskReconciliationResultType } from "../schemas/reconciliation.js";
import { createApprovalRequestTask } from "../tasks/create-approval-request.js";
import { recordApprovalContinuationEnvelopeTask } from "../tasks/record-approval-continuation-envelope.js";
import { discoverRepositoryCapabilitiesTask } from "../tasks/repository-capabilities.js";
import { generateRepositoryPatchPlanTask } from "../tasks/generate-repository-patch-plan.js";
import { generateRepositoryReviewTask } from "../tasks/generate-repository-review.js";
import { loadRepositoryWorkspaceTask } from "../tasks/load-repository-workspace.js";
import { proposeRepositoryPatchTask, applyRepositoryPatchTask } from "../tasks/repository-patch.js";
import { readRepositoryFilesTask } from "../tasks/read-repository-files.js";
import { recordStatusTask } from "../tasks/record-status.js";
import { getRepositoryDiffTask, runRepositoryVerificationTask } from "../tasks/repository-verify.js";

export const repositoryTaskReconciler = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "repository-task-reconciler",
  retries: 0,
  executionTimeout: "15m",
  fn: async (rawInput: HatchetJsonObject, ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const now = new Date().toISOString();
    const input = RepositoryTaskInput.parse(rawInput);
    const workspace = RepositoryWorkspace.parse(await ctx.runChild(loadRepositoryWorkspaceTask, toHatchetJsonObject(input), {
      key: `${input.task_run_id}:repo-workspace`,
    }));
    await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, "discovering_capabilities"));

    const capabilitySnapshot = CapabilitySnapshot.parse(await ctx.runChild(discoverRepositoryCapabilitiesTask, toHatchetJsonObject(workspace), {
      key: `${input.task_run_id}:repo-capabilities`,
    }));
    await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, "inspecting"));

    const inspection = await ctx.runChild(readRepositoryFilesTask, toHatchetJsonObject({ workspace, query: input.goal }), {
      key: `${input.task_run_id}:repo-inspect`,
    });
    const reads = zReads(inspection);
    await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, "planning_patch", { inspected_files: reads.map((file) => file.relative_path) }));

    const patchPlan = PatchPlan.parse(await ctx.runChild(generateRepositoryPatchPlanTask, toHatchetJsonObject({
      goal: input.goal,
      files: reads,
      dry_run: input.dry_run,
    }), { key: `${input.task_run_id}:repo-patch-plan` }));

    const preview = PatchPreview.parse(await ctx.runChild(proposeRepositoryPatchTask, toHatchetJsonObject({
      workspace,
      patch_plan: patchPlan,
    }), { key: `${input.task_run_id}:repo-propose-patch` }));
    const needsApproval = preview.requires_approval || input.require_approval || (!input.apply && input.dry_run);
    if (needsApproval) {
      const approvalRequest = approvalRequestFor(input, patchPlan, now);
      await ctx.runChild(createApprovalRequestTask, toHatchetJsonObject(approvalRequest), { key: `${input.task_run_id}:repo-approval` });
      await ctx.runChild(recordApprovalContinuationEnvelopeTask, toHatchetJsonObject({
        kind: "repository_patch",
        approval_request: approvalRequest,
        project_id: input.project_id,
        task_run_id: input.task_run_id,
        trace_id: input.delegation_context.trace_id,
        payload: {
          goal: input.goal,
          workspace,
          patch_plan: patchPlan,
          patch_preview: preview,
          capability_snapshot: capabilitySnapshot,
          verification_command_ids: input.verification_command_ids,
          inspected_files: reads.map((file) => file.relative_path),
        },
      }), { key: `${input.task_run_id}:repo-continuation-envelope` });
      const result = taskResult("requires_approval", input, capabilitySnapshot, preview, undefined, undefined, approvalRequest, "Repository patch requires approval.");
      await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, "awaiting_approval", {
        inspected_files: reads.map((file) => file.relative_path),
        planned_files: preview.touched_files,
        approval_request: approvalRequest,
      }), result);
      return toHatchetJsonObject(result);
    }

    await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, "applying_patch", {
      inspected_files: reads.map((file) => file.relative_path),
      planned_files: preview.touched_files,
    }));
    await ctx.runChild(applyRepositoryPatchTask, toHatchetJsonObject({
      workspace,
      patch_plan: patchPlan,
    }), { key: `${input.task_run_id}:repo-apply:${patchPlan.idempotency_key}` });

    await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, "verifying", { planned_files: preview.touched_files }));
    const verification = VerificationReport.parse(await ctx.runChild(runRepositoryVerificationTask, toHatchetJsonObject({
      workspace,
      command_ids: input.verification_command_ids,
    }), { key: `${input.task_run_id}:repo-verify` }));
    const diff = DiffReport.parse(await ctx.runChild(getRepositoryDiffTask, toHatchetJsonObject({ workspace }), {
      key: `${input.task_run_id}:repo-diff`,
    }));
    await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, "reviewing", {
      changed_files: diff.changed_files,
      verification_results: verification.results,
      diff_summary: diff.diff_stat,
      diff_text: diff.diff_text,
    }));
    const review = ReviewReport.parse(await ctx.runChild(generateRepositoryReviewTask, toHatchetJsonObject({
      goal: input.goal,
      changed_files: diff.changed_files,
      diff_summary: diff.diff_stat,
      verification_report: verification,
    }), { key: `${input.task_run_id}:repo-review` }));

    const status = verification.passed ? "completed" : "completed_with_errors";
    const result = taskResult(status, input, capabilitySnapshot, preview, verification, review, undefined, review.pr_summary);
    await recordRepoStatus(ctx, input, repositoryStatus(input, workspace, status, {
      inspected_files: reads.map((file) => file.relative_path),
      planned_files: preview.touched_files,
      changed_files: diff.changed_files,
      verification_results: verification.results,
      diff_summary: diff.diff_stat,
      diff_text: diff.diff_text,
      review_report: review,
    }), result);
    return toHatchetJsonObject(result);
  },
});

async function recordRepoStatus(
  ctx: Context<HatchetJsonObject>,
  input: RepositoryTaskInputType,
  repository_status: RepositoryTaskStatusType,
  result?: TaskReconciliationResultType,
): Promise<void> {
  await ctx.runChild(recordStatusTask, toHatchetJsonObject({
    kind: "task",
    snapshot: {
      project_id: input.project_id,
      task_id: "repository-task",
      task_run_id: input.task_run_id,
      status: repository_status.current_phase === "awaiting_approval" ? "requires_approval" : toWorkflowStatus(repository_status.current_phase),
      observations: [],
      errors: [],
      final_message: repository_status.review_report?.pr_summary ?? repository_status.diff_summary ?? repository_status.current_phase,
      repository_status,
      ...(result ? { result } : {}),
      updated_at: new Date().toISOString(),
    },
  }), { key: `${input.task_run_id}:repo-status:${repository_status.current_phase}` });
}

function repositoryStatus(
  input: RepositoryTaskInputType,
  workspace: RepositoryWorkspace,
  current_phase: RepositoryTaskStatusType["current_phase"],
  patch: Partial<RepositoryTaskStatusType> = {},
): RepositoryTaskStatusType {
  return RepositoryTaskStatus.parse({
    workspace_id: workspace.workspace_id,
    repo_root: workspace.repo_root,
    current_phase,
    inspected_files: [],
    planned_files: [],
    changed_files: [],
    verification_results: [],
    errors: [],
    observations: [observation({ status: "recorded", summary: `Repository phase: ${current_phase}`, now: new Date().toISOString(), task_id: input.task_run_id })],
    ...patch,
  });
}

function taskResult(
  status: TaskReconciliationResultType["status"],
  input: RepositoryTaskInputType,
  capabilitySnapshot: CapabilitySnapshot,
  preview: PatchPreviewType,
  verification: VerificationReportType | undefined,
  review: ReviewReportType | undefined,
  approval_request: ApprovalRequest | undefined,
  final_message: string,
): TaskReconciliationResultType {
  const item = status === "completed_with_errors"
    ? structuredError({ code: "RESULT_VALIDATION_FAILED", message: "Verification failed", now: new Date().toISOString(), task_id: input.task_run_id })
    : undefined;
  return TaskReconciliationResult.parse({
    reconciliation_id: deterministicReconciliationId({ task_id: input.task_run_id, status, preview }),
    task_id: "repository-task",
    task_run_id: input.task_run_id,
    status,
    capability_snapshot: capabilitySnapshot,
    artifact: CognitiveArtifact.parse({
      artifact_id: `artifact_${input.task_run_id}`,
      schema_version: "open-cot.core.v1",
      capability_snapshot_id: capabilitySnapshot.snapshot_id,
      intent_verification: {
        objective: input.goal,
        request_boundaries: ["Repository capability pack only", "No arbitrary commands"],
        allowed_scope: capabilitySnapshot.capabilities.map((capability) => capability.capability_name),
        prohibited_scope: ["Paths outside repo root", "Unallowlisted commands"],
      },
      assumptions: [],
      reasoning_trace: { evidence_mode: "audit_summary", summary: preview.patch_plan.summary, steps: [] },
      execution_intents: [],
      observations: [],
      uncertainty: { level: "low", explanation: "Repository task used policy-gated pack execution." },
    }),
    executed_intents: [],
    skipped_intents: [],
    observations: [observation({ status: "recorded", summary: final_message, now: new Date().toISOString(), task_id: input.task_run_id, output: { verification, review } })],
    errors: item ? [item] : [],
    final_message,
    ...(approval_request ? { approval_request } : {}),
  });
}

function approvalRequestFor(input: RepositoryTaskInputType, patchPlan: PatchPlan, now: string): ApprovalRequest {
  return {
    approval_request_id: deterministicApprovalRequestId({ task_run_id: input.task_run_id, patch_plan_id: patchPlan.patch_plan_id }),
    task_id: "repository-task",
    project_id: input.project_id,
    intent_id: patchPlan.patch_plan_id,
    requested_risk_level: patchPlan.risk_level,
    requested_capability: "repo.apply_patch",
    task_run_id: input.task_run_id,
    requested_at: now,
    prompt: `Approve repository patch: ${patchPlan.summary}`,
    trace_id: input.delegation_context.trace_id,
  };
}

function toWorkflowStatus(phase: RepositoryTaskStatusType["current_phase"]): "accepted" | "planning" | "running" | "completed" | "completed_with_errors" | "yielded" | "requires_approval" | "failed" {
  if (phase === "completed" || phase === "completed_with_errors" || phase === "yielded" || phase === "failed") return phase;
  if (phase === "accepted" || phase === "planning") return phase;
  return "running";
}

function zReads(input: unknown): readonly { readonly relative_path: string; readonly content: string; readonly sha256: string; readonly size: number; readonly truncated: boolean }[] {
  if (!input || typeof input !== "object" || !Array.isArray((input as { reads?: unknown }).reads)) return [];
  return (input as { reads: unknown[] }).reads.map((item) => item as { relative_path: string; content: string; sha256: string; size: number; truncated: boolean });
}
