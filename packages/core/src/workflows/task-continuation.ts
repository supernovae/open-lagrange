import type { Context } from "@hatchet-dev/typescript-sdk/v1/index.js";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { deterministicReconciliationId } from "../ids/deterministic-ids.js";
import { evaluatePolicy } from "../policy/policy-gate.js";
import { validateIntentForSnapshot } from "../reconciliation/intent-validation.js";
import { observation, structuredError } from "../reconciliation/records.js";
import { CapabilitySnapshot } from "../schemas/capabilities.js";
import { ApprovalContinuationContext, ApprovalContinuationInput, CriticResult, TaskReconciliationResult, type TaskReconciliationResult as TaskReconciliationResultType } from "../schemas/reconciliation.js";
import { executeMcpIntentTask, ExecuteMcpIntentOutput } from "../tasks/execute-mcp-intent.js";
import { loadApprovalContinuationTask, LoadApprovalContinuationOutput } from "../tasks/load-approval-continuation.js";
import { recordStatusTask } from "../tasks/record-status.js";
import { runCriticTask } from "../tasks/run-critic.js";

export const taskContinuation = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "task-continuation",
  retries: 0,
  executionTimeout: "10m",
  fn: async (rawInput: HatchetJsonObject, ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const now = new Date().toISOString();
    const input = ApprovalContinuationInput.parse(rawInput);
    const loaded = LoadApprovalContinuationOutput.parse(await ctx.runChild(loadApprovalContinuationTask, toHatchetJsonObject(input), {
      key: `${input.task_run_id}:load-continuation:${input.approval_request_id}`,
    }));
    if (!loaded.context || !loaded.decision) {
      return toHatchetJsonObject(finishResult("failed", missingContextResult(input.task_run_id, now), ctx));
    }

    const context = ApprovalContinuationContext.parse(loaded.context);
    const decision = loaded.decision;
    if (context.task_run_id !== input.task_run_id || context.approval_request.approval_request_id !== input.approval_request_id) {
      const item = structuredError({ code: "INVALID_ARTIFACT", message: "Approval continuation context does not match input", now, task_id: context.scoped_task.task_id });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromContext("failed", context, [], [item], "Approval continuation context did not match."), now));
    }
    if (decision.decision !== "approved") {
      const item = structuredError({ code: "YIELDED", message: decision.reason ?? "Approval was not granted", now, task_id: context.scoped_task.task_id, intent_id: context.intent.intent_id });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromContext("yielded", context, [], [item], "Task yielded after rejection."), now));
    }

    const prepared = validateIntentForSnapshot({
      intent: context.intent,
      snapshot: context.capability_snapshot,
      task_id: context.scoped_task.task_id,
      now,
    });
    if (!prepared.ok) {
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromContext("failed", context, [], [prepared.error], "Approved intent no longer validates."), now));
    }

    const policy = evaluatePolicy({
      delegation_context: context.delegation_context,
      scoped_task: context.scoped_task,
      capability: prepared.capability,
      intent: context.intent,
      bounds: context.bounds,
      endpoint_attempts_used: 0,
      now,
    });
    if (policy.outcome === "deny" || policy.outcome === "yield") {
      const item = structuredError({ code: policy.outcome === "yield" ? "YIELDED" : "POLICY_DENIED", message: policy.reason, now, task_id: context.scoped_task.task_id, intent_id: context.intent.intent_id });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromContext(policy.outcome === "yield" ? "yielded" : "failed", context, [], [item], "Approved intent failed policy validation."), now));
    }

    const output = ExecuteMcpIntentOutput.parse(await ctx.runChild(executeMcpIntentTask, toHatchetJsonObject({
      endpoint_id: context.intent.endpoint_id,
      capability_name: context.intent.capability_name,
      arguments: context.intent.arguments,
      idempotency_key: context.intent.idempotency_key,
      delegation_context: context.delegation_context,
      capability_snapshot_id: context.capability_snapshot.snapshot_id,
    }), {
      key: `${context.task_run_id}:approved-execute:${context.intent.idempotency_key}`,
      additionalMetadata: {
        project_id: context.parent_project_id,
        task_run_id: context.task_run_id,
        intent_id: context.intent.intent_id,
        trace_id: context.delegation_context.trace_id,
      },
    }));
    if (output.status !== "ok") {
      const item = structuredError({ code: "MCP_EXECUTION_FAILED", message: output.message, now, task_id: context.scoped_task.task_id, intent_id: context.intent.intent_id });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromContext("failed", context, [], [item], "Approved endpoint execution failed."), now));
    }

    const observations = [observation({ status: "recorded", summary: output.message, now, task_id: context.scoped_task.task_id, intent_id: context.intent.intent_id, output: output.result })];
    const critic = CriticResult.parse(await ctx.runChild(runCriticTask, toHatchetJsonObject({
      scoped_task: context.scoped_task,
      output: output.result,
    }), { key: `${context.task_run_id}:approved-critic:${context.intent.intent_id}` }));
    if (critic.outcome !== "pass") {
      const item = structuredError({ code: critic.outcome === "revise" ? "REVISION_UNSUPPORTED" : "YIELDED", message: critic.summary, now, task_id: context.scoped_task.task_id, intent_id: context.intent.intent_id });
      return toHatchetJsonObject(await recordAndReturn(ctx, resultFromContext("yielded", context, observations, [item], "Approved task yielded after critic review."), now));
    }

    return toHatchetJsonObject(await recordAndReturn(ctx, resultFromContext("completed", context, observations, [], "Approved task completed."), now));
  },
});

async function recordAndReturn(
  ctx: Context<HatchetJsonObject>,
  result: TaskReconciliationResultType,
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
      updated_at: now,
    },
  }), { key: `${result.task_run_id}:continuation-status:${result.status}` });
  return result;
}

function resultFromContext(
  status: TaskReconciliationResultType["status"],
  context: ApprovalContinuationContext,
  observations: TaskReconciliationResultType["observations"],
  errors: TaskReconciliationResultType["errors"],
  finalMessage: string,
): TaskReconciliationResultType {
  return TaskReconciliationResult.parse({
    reconciliation_id: deterministicReconciliationId({ task_id: context.scoped_task.task_id, status, errors }),
    task_id: context.scoped_task.task_id,
    task_run_id: context.task_run_id,
    status,
    capability_snapshot: CapabilitySnapshot.parse(context.capability_snapshot),
    artifact: context.artifact,
    executed_intents: status === "completed" ? [context.intent] : [],
    skipped_intents: status === "completed" ? [] : [context.intent],
    observations,
    errors,
    final_message: finalMessage,
    approval_request: context.approval_request,
  });
}

function missingContextResult(taskRunId: string, now: string): TaskReconciliationResultType {
  const item = structuredError({ code: "INVALID_ARTIFACT", message: "Approval continuation context was not found", now });
  return TaskReconciliationResult.parse({
    reconciliation_id: deterministicReconciliationId({ taskRunId, errors: [item] }),
    task_id: "unknown",
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
    final_message: "Approval continuation context was not found.",
  });
}

function finishResult(
  _status: TaskReconciliationResultType["status"],
  result: TaskReconciliationResultType,
  _ctx: Context<HatchetJsonObject>,
): TaskReconciliationResultType {
  return result;
}
