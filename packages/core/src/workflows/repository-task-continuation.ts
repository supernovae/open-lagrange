import type { Context } from "@hatchet-dev/typescript-sdk";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { deterministicReconciliationId } from "../ids/deterministic-ids.js";
import { observation, structuredError } from "../reconciliation/records.js";
import { CapabilitySnapshot } from "../schemas/capabilities.js";
import { CognitiveArtifact } from "../schemas/open-cot.js";
import { PatchPlan, PatchPreview, type PatchPreview as PatchPreviewType } from "../schemas/patch-plan.js";
import { ApprovalContinuationInput, TaskReconciliationResult, type ApprovalRequest, type TaskReconciliationResult as TaskReconciliationResultType } from "../schemas/reconciliation.js";
import { DiffReport, RepositoryApprovalContinuationPayload, RepositoryTaskStatus, VerificationReport, ReviewReport, type RepositoryApprovalContinuationPayload as RepositoryApprovalContinuationPayloadType, type RepositoryTaskStatus as RepositoryTaskStatusType, type VerificationReport as VerificationReportType, type ReviewReport as ReviewReportType } from "../schemas/repository.js";
import { loadApprovalContinuationEnvelopeTask, LoadApprovalContinuationEnvelopeOutput } from "../tasks/load-approval-continuation-envelope.js";
import { proposeRepositoryPatchTask, applyRepositoryPatchTask } from "../tasks/repository-patch.js";
import { getRepositoryDiffTask, runRepositoryVerificationTask } from "../tasks/repository-verify.js";
import { generateRepositoryReviewTask } from "../tasks/generate-repository-review.js";
import { recordStatusTask } from "../tasks/record-status.js";

export const repositoryTaskContinuation = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "repository-task-continuation",
  retries: 0,
  executionTimeout: "10m",
  fn: async (rawInput: HatchetJsonObject, ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const now = new Date().toISOString();
    const input = ApprovalContinuationInput.parse(rawInput);
    const loaded = LoadApprovalContinuationEnvelopeOutput.parse(await ctx.runChild(loadApprovalContinuationEnvelopeTask, toHatchetJsonObject(input), {
      key: `${input.task_run_id}:load-repo-continuation:${input.approval_request_id}`,
    }));
    if (!loaded.envelope || !loaded.decision) {
      return toHatchetJsonObject(await recordAndReturn(ctx, missingContextResult(input.task_run_id, now), undefined, now));
    }
    if (loaded.envelope.kind !== "repository_patch") {
      return toHatchetJsonObject(await recordAndReturn(ctx, missingContextResult(input.task_run_id, now), undefined, now));
    }

    const payload = RepositoryApprovalContinuationPayload.parse(loaded.envelope.payload);
    if (loaded.envelope.task_run_id !== input.task_run_id || loaded.envelope.approval_request.approval_request_id !== input.approval_request_id) {
      const item = structuredError({ code: "INVALID_ARTIFACT", message: "Repository approval continuation context does not match input", now, task_id: "repository-task" });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromPayload("failed", input.task_run_id, payload, loaded.envelope.approval_request, undefined, undefined, [item], "Approval continuation context did not match."), repositoryStatus(input.task_run_id, payload, "failed", { errors: [item] }), now));
    }
    if (loaded.decision.decision !== "approved") {
      const item = structuredError({ code: "YIELDED", message: loaded.decision.reason ?? "Approval was not granted", now, task_id: "repository-task", intent_id: payload.patch_plan.patch_plan_id });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromPayload("yielded", input.task_run_id, payload, loaded.envelope.approval_request, undefined, undefined, [item], "Repository task yielded after rejection."), repositoryStatus(input.task_run_id, payload, "yielded", { errors: [item] }), now));
    }

    const preview = PatchPreview.parse(await ctx.runChild(proposeRepositoryPatchTask, toHatchetJsonObject({
      workspace: payload.workspace,
      patch_plan: payload.patch_plan,
    }), { key: `${input.task_run_id}:approved-repo-propose:${payload.patch_plan.idempotency_key}` }));
    if (JSON.stringify(preview.touched_files) !== JSON.stringify(payload.patch_preview.touched_files)) {
      const item = structuredError({ code: "INVALID_ARTIFACT", message: "Approved patch preview changed before continuation", now, task_id: "repository-task", intent_id: payload.patch_plan.patch_plan_id });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromPayload("failed", input.task_run_id, payload, loaded.envelope.approval_request, undefined, undefined, [item], "Approved patch preview changed."), repositoryStatus(input.task_run_id, payload, "failed", { errors: [item] }), now));
    }

    await recordAndReturn(ctx, resultFromPayload("requires_approval", input.task_run_id, payload, loaded.envelope.approval_request, undefined, undefined, [], "Approved repository patch is applying."), repositoryStatus(input.task_run_id, payload, "applying_patch"), now);
    await ctx.runChild(applyRepositoryPatchTask, toHatchetJsonObject({
      workspace: payload.workspace,
      patch_plan: payload.patch_plan,
    }), { key: `${input.task_run_id}:approved-repo-apply:${payload.patch_plan.idempotency_key}` });

    const verification = VerificationReport.parse(await ctx.runChild(runRepositoryVerificationTask, toHatchetJsonObject({
      workspace: payload.workspace,
      command_ids: payload.verification_command_ids,
    }), { key: `${input.task_run_id}:approved-repo-verify` }));
    const diff = DiffReport.parse(await ctx.runChild(getRepositoryDiffTask, toHatchetJsonObject({ workspace: payload.workspace }), {
      key: `${input.task_run_id}:approved-repo-diff`,
    }));
    const review = ReviewReport.parse(await ctx.runChild(generateRepositoryReviewTask, toHatchetJsonObject({
      goal: payload.goal,
      changed_files: diff.changed_files,
      diff_summary: diff.diff_stat,
      verification_report: verification,
    }), { key: `${input.task_run_id}:approved-repo-review` }));

    const status = verification.passed ? "completed" : "completed_with_errors";
    return toHatchetJsonObject(await recordAndReturn(ctx, resultFromPayload(status, input.task_run_id, payload, loaded.envelope.approval_request, verification, review, [], review.pr_summary), repositoryStatus(input.task_run_id, payload, status, {
      changed_files: diff.changed_files,
      verification_results: verification.results,
      diff_summary: diff.diff_stat,
      diff_text: diff.diff_text,
      review_report: review,
    }), now));
  },
});

async function recordAndReturn(
  ctx: Context<HatchetJsonObject>,
  result: TaskReconciliationResultType,
  repository_status: RepositoryTaskStatusType | undefined,
  now: string,
): Promise<TaskReconciliationResultType> {
  await ctx.runChild(recordStatusTask, toHatchetJsonObject({
    kind: "task",
    snapshot: {
      project_id: result.approval_request?.project_id ?? result.task_id,
      task_id: result.task_id,
      task_run_id: result.task_run_id,
      status: result.status,
      observations: result.observations,
      errors: result.errors,
      final_message: result.final_message,
      result,
      ...(repository_status ? { repository_status } : {}),
      updated_at: now,
    },
  }), { key: `${result.task_run_id}:repository-continuation-status:${result.status}` });
  return result;
}

function repositoryStatus(
  taskRunId: string,
  payload: RepositoryApprovalContinuationPayloadType,
  current_phase: RepositoryTaskStatusType["current_phase"],
  patch: Partial<RepositoryTaskStatusType> = {},
): RepositoryTaskStatusType {
  return RepositoryTaskStatus.parse({
    workspace_id: payload.workspace.workspace_id,
    repo_root: payload.workspace.repo_root,
    current_phase,
    inspected_files: payload.inspected_files,
    planned_files: payload.patch_preview.touched_files,
    changed_files: [],
    verification_results: [],
    errors: [],
    observations: [observation({ status: "recorded", summary: `Repository approval continuation phase: ${current_phase}`, now: new Date().toISOString(), task_id: taskRunId })],
    approval_request: undefined,
    ...patch,
  });
}

function resultFromPayload(
  status: TaskReconciliationResultType["status"],
  taskRunId: string,
  payload: RepositoryApprovalContinuationPayloadType,
  approvalRequest: ApprovalRequest,
  verification: VerificationReportType | undefined,
  review: ReviewReportType | undefined,
  errors: TaskReconciliationResultType["errors"],
  finalMessage: string,
): TaskReconciliationResultType {
  return TaskReconciliationResult.parse({
    reconciliation_id: deterministicReconciliationId({ taskRunId, status, patch_plan_id: payload.patch_plan.patch_plan_id, errors }),
    task_id: "repository-task",
    task_run_id: taskRunId,
    status,
    capability_snapshot: CapabilitySnapshot.parse(payload.capability_snapshot),
    artifact: CognitiveArtifact.parse({
      artifact_id: `artifact_${taskRunId}`,
      schema_version: "open-cot.core.v1",
      capability_snapshot_id: payload.capability_snapshot.snapshot_id,
      intent_verification: {
        objective: payload.goal,
        request_boundaries: ["Repository capability pack only", "Approved patch plan only"],
        allowed_scope: payload.capability_snapshot.capabilities.map((capability) => capability.capability_name),
        prohibited_scope: ["Mutating approved patch plan", "Unallowlisted commands"],
      },
      assumptions: [],
      reasoning_trace: { evidence_mode: "audit_summary", summary: payload.patch_plan.summary, steps: [] },
      execution_intents: [],
      observations: [],
      uncertainty: { level: "low", explanation: "Repository approval continuation used persisted patch context." },
    }),
    executed_intents: status === "completed" || status === "completed_with_errors" ? [] : [],
    skipped_intents: status === "yielded" || status === "failed" ? [] : [],
    observations: [observation({ status: status === "completed" ? "recorded" : "recorded", summary: finalMessage, now: new Date().toISOString(), task_id: taskRunId, output: { verification, review } })],
    errors,
    final_message: finalMessage,
    approval_request: approvalRequest,
  });
}

function missingContextResult(taskRunId: string, now: string): TaskReconciliationResultType {
  const item = structuredError({ code: "INVALID_ARTIFACT", message: "Repository approval continuation context was not found", now });
  return TaskReconciliationResult.parse({
    reconciliation_id: deterministicReconciliationId({ taskRunId, errors: [item] }),
    task_id: "repository-task",
    task_run_id: taskRunId,
    status: "failed",
    capability_snapshot: {
      snapshot_id: "caps_missing",
      created_at: now,
      capabilities_hash: "0".repeat(64),
      capabilities: [],
    },
    executed_intents: [],
    skipped_intents: [],
    observations: [],
    errors: [item],
    final_message: "Repository approval continuation context was not found.",
  });
}

