import type { Context } from "@hatchet-dev/typescript-sdk";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { deterministicApprovalRequestId, deterministicReconciliationId } from "../ids/deterministic-ids.js";
import { evaluatePolicy } from "../policy/policy-gate.js";
import { validateIntentForSnapshot } from "../reconciliation/intent-validation.js";
import { observation, structuredError } from "../reconciliation/records.js";
import { validateMcpResult } from "../mcp/mock-registry.js";
import { DelegationContext } from "../schemas/delegation.js";
import { CognitiveArtifact, type ExecutionIntent, type Observation, type StructuredError } from "../schemas/open-cot.js";
import { CriticResult, TaskReconcilerInput, TaskReconciliationResult, type ApprovalRequest, type TaskReconciliationResult as TaskReconciliationResultType } from "../schemas/reconciliation.js";
import { CapabilitySnapshot } from "../schemas/capabilities.js";
import { createApprovalRequestTask } from "../tasks/create-approval-request.js";
import { discoverCapabilitiesTask } from "../tasks/discover-capabilities.js";
import { executeMcpIntentTask } from "../tasks/execute-mcp-intent.js";
import { ExecuteMcpIntentOutput } from "../tasks/execute-mcp-intent.js";
import { generateTaskArtifactTask } from "../tasks/generate-task-artifact.js";
import { recordContinuationContextTask } from "../tasks/record-continuation-context.js";
import { recordStatusTask } from "../tasks/record-status.js";
import { runCriticTask } from "../tasks/run-critic.js";

interface TaskState {
  readonly observations: Observation[];
  readonly errors: StructuredError[];
  readonly executed: ExecutionIntent[];
  readonly skipped: ExecutionIntent[];
}

export const taskReconciler = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "task-reconciler",
  retries: 0,
  executionTimeout: "10m",
  fn: async (rawInput: HatchetJsonObject, ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const now = new Date().toISOString();
    const parsedInput = TaskReconcilerInput.safeParse(rawInput);
    if (!parsedInput.success) {
      const item = structuredError({ code: "INVALID_DELEGATION_CONTEXT", message: parsedInput.error.message, now });
      return toHatchetJsonObject(failedTaskResult("unknown", "unknown", now, undefined, [], [item], "Task input was invalid."));
    }

    const input = parsedInput.data;
    const delegation = DelegationContext.parse({
      ...input.delegation_context,
      task_run_id: input.task_run_id,
    });
    const state: TaskState = { observations: [], errors: [], executed: [], skipped: [] };

    await ctx.runChild(recordStatusTask, toHatchetJsonObject({
      kind: "task",
      snapshot: {
        project_id: input.parent_project_id,
        task_id: input.scoped_task.task_id,
        task_run_id: input.task_run_id,
        status: "running",
        observations: [],
        errors: [],
        final_message: "Discovering scoped capabilities.",
        updated_at: now,
      },
    }), { key: `${input.task_run_id}:status:start` });

    const capabilitySnapshot = CapabilitySnapshot.parse(await ctx.runChild(discoverCapabilitiesTask, toHatchetJsonObject({
      workspace_id: delegation.workspace_id,
      scoped_task: input.scoped_task,
      delegation_context: delegation,
      max_risk_level: input.bounds.max_risk_without_approval,
      now,
    }), { key: `${input.task_run_id}:discover-capabilities` }));

    const artifactCandidate = await ctx.runChild(generateTaskArtifactTask, toHatchetJsonObject({
      scoped_task: input.scoped_task,
      delegation_context: delegation,
      capability_snapshot: capabilitySnapshot,
      prior_observations: [],
    }), {
      key: `${input.task_run_id}:artifact`,
      additionalMetadata: {
        project_id: input.parent_project_id,
        task_run_id: input.task_run_id,
        trace_id: delegation.trace_id,
      },
    });
    const artifactParsed = CognitiveArtifact.safeParse(artifactCandidate);
    if (!artifactParsed.success) {
      const item = structuredError({
        code: "INVALID_ARTIFACT",
        message: artifactParsed.error.message,
        now,
        task_id: input.scoped_task.task_id,
      });
      state.errors.push(item);
      state.observations.push(observation({
        status: "error",
        summary: "Cognitive artifact failed validation",
        now,
        task_id: input.scoped_task.task_id,
      }));
      return toHatchetJsonObject(taskResult("failed", input, capabilitySnapshot, undefined, state, "The cognitive artifact was invalid."));
    }

    const artifact = artifactParsed.data;
    if (artifact.capability_snapshot_id !== capabilitySnapshot.snapshot_id) {
      const item = structuredError({
        code: "SNAPSHOT_MISMATCH",
        message: "Artifact references a different capability snapshot",
        now,
        task_id: input.scoped_task.task_id,
      });
      state.errors.push(item);
      state.observations.push(observation({ status: "error", summary: item.message, now, task_id: input.scoped_task.task_id }));
      return toHatchetJsonObject(taskResult("failed", input, capabilitySnapshot, artifact, state, "Capability snapshot mismatch."));
    }

    if (artifact.execution_intents.length === 0) {
      const item = structuredError({
        code: "YIELDED",
        message: artifact.yield_reason ?? "No execution intent emitted",
        now,
        task_id: input.scoped_task.task_id,
      });
      state.errors.push(item);
      state.observations.push(observation({ status: "skipped", summary: item.message, now, task_id: input.scoped_task.task_id }));
      return toHatchetJsonObject(taskResult("yielded", input, capabilitySnapshot, artifact, state, "The task yielded without execution."));
    }

    if (artifact.execution_intents.length > input.bounds.max_execution_intents_per_task) {
      const item = structuredError({
        code: "BUDGET_EXCEEDED",
        message: "Too many execution intents emitted",
        now,
        task_id: input.scoped_task.task_id,
      });
      state.errors.push(item);
      state.observations.push(observation({ status: "error", summary: item.message, now, task_id: input.scoped_task.task_id }));
      return toHatchetJsonObject(taskResult("failed", input, capabilitySnapshot, artifact, state, "Execution intent bound exceeded."));
    }

    for (const intent of artifact.execution_intents) {
      const prepared = validateIntentForSnapshot({
        intent,
        snapshot: capabilitySnapshot,
        task_id: input.scoped_task.task_id,
        now,
      });
      if (!prepared.ok) {
        state.skipped.push(intent);
        state.errors.push(prepared.error);
        state.observations.push(observation({ status: "error", summary: prepared.error.message, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id }));
        continue;
      }

      const policy = evaluatePolicy({
        delegation_context: delegation,
        scoped_task: input.scoped_task,
        capability: prepared.capability,
        intent,
        bounds: input.bounds,
        endpoint_attempts_used: state.executed.length + state.skipped.length,
        now,
      });

      if (policy.outcome !== "allow") {
        const code = policy.outcome === "requires_approval" ? "APPROVAL_REQUIRED" : policy.outcome === "yield" ? "YIELDED" : "POLICY_DENIED";
        const item = structuredError({ code, message: policy.reason, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id });
        state.skipped.push(intent);
        state.errors.push(item);
        state.observations.push(observation({ status: policy.outcome === "yield" ? "skipped" : "error", summary: policy.reason, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id }));
        if (policy.outcome === "requires_approval") {
          const approvalRequest: ApprovalRequest = {
            approval_request_id: deterministicApprovalRequestId({
              task_run_id: input.task_run_id,
              intent_id: intent.intent_id,
              capability_digest: intent.capability_digest,
            }),
            task_id: input.scoped_task.task_id,
            project_id: input.parent_project_id,
            intent_id: intent.intent_id,
            requested_risk_level: intent.risk_level,
            requested_capability: intent.capability_name,
            task_run_id: input.task_run_id,
            requested_at: now,
            prompt: `Approve ${intent.capability_name} for task ${input.scoped_task.title}`,
            trace_id: delegation.trace_id,
          };
          await ctx.runChild(createApprovalRequestTask, toHatchetJsonObject(approvalRequest), { key: `${input.task_run_id}:approval:${intent.intent_id}` });
          await ctx.runChild(recordContinuationContextTask, toHatchetJsonObject({
            approval_request: approvalRequest,
            parent_project_id: input.parent_project_id,
            parent_project_run_id: input.parent_project_run_id,
            task_run_id: input.task_run_id,
            scoped_task: input.scoped_task,
            delegation_context: delegation,
            bounds: input.bounds,
            capability_snapshot: capabilitySnapshot,
            artifact,
            intent,
          }), { key: `${input.task_run_id}:continuation:${intent.intent_id}` });
          return toHatchetJsonObject(taskResult("requires_approval", input, capabilitySnapshot, artifact, state, "Approval is required.", approvalRequest));
        }
        if (policy.outcome === "yield") return toHatchetJsonObject(taskResult("yielded", input, capabilitySnapshot, artifact, state, "The policy gate yielded."));
        continue;
      }

      const output = ExecuteMcpIntentOutput.parse(await ctx.runChild(executeMcpIntentTask, toHatchetJsonObject({
        endpoint_id: intent.endpoint_id,
        capability_name: intent.capability_name,
        arguments: intent.arguments,
        idempotency_key: intent.idempotency_key,
        delegation_context: delegation,
      }), {
        key: `${input.task_run_id}:execute:${intent.idempotency_key}`,
        additionalMetadata: {
          project_id: input.parent_project_id,
          task_run_id: input.task_run_id,
          intent_id: intent.intent_id,
          trace_id: delegation.trace_id,
        },
      }));

      if (output.status !== "ok") {
        const item = structuredError({ code: "MCP_EXECUTION_FAILED", message: output.message, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id });
        state.skipped.push(intent);
        state.errors.push(item);
        state.observations.push(observation({ status: "error", summary: output.message, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id }));
        continue;
      }

      const outputValidation = validateMcpResult(prepared.capability, output.result);
      if (!outputValidation.ok) {
        const item = structuredError({ code: "RESULT_VALIDATION_FAILED", message: outputValidation.message, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id });
        state.skipped.push(intent);
        state.errors.push(item);
        state.observations.push(observation({ status: "error", summary: item.message, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id, output: output.result }));
        continue;
      }

      state.executed.push(intent);
      state.observations.push(observation({ status: "recorded", summary: output.message, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id, output: output.result }));

      const critic = CriticResult.parse(await ctx.runChild(runCriticTask, toHatchetJsonObject({
        scoped_task: input.scoped_task,
        output: output.result,
      }), { key: `${input.task_run_id}:critic:${intent.intent_id}` }));

      if (critic.outcome === "yield") {
        const item = structuredError({ code: "YIELDED", message: critic.summary, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id });
        state.errors.push(item);
        return toHatchetJsonObject(taskResult("yielded", input, capabilitySnapshot, artifact, state, "The critic yielded."));
      }
      if (critic.outcome === "revise") {
        const item = structuredError({ code: "REVISION_UNSUPPORTED", message: critic.summary, now, intent_id: intent.intent_id, task_id: input.scoped_task.task_id });
        state.errors.push(item);
        return toHatchetJsonObject(taskResult("yielded", input, capabilitySnapshot, artifact, state, "Revision is unsupported in this slice."));
      }
    }

    if (state.executed.length === 0 && state.errors.length > 0) return toHatchetJsonObject(taskResult("failed", input, capabilitySnapshot, artifact, state, "No execution intent completed."));
    if (state.errors.length > 0) return toHatchetJsonObject(taskResult("completed_with_errors", input, capabilitySnapshot, artifact, state, "Task completed with errors."));
    return toHatchetJsonObject(taskResult("completed", input, capabilitySnapshot, artifact, state, "Task completed."));
  },
});

function taskResult(
  status: TaskReconciliationResultType["status"],
  input: { readonly scoped_task: { readonly task_id: string }; readonly task_run_id: string },
  capabilitySnapshot: CapabilitySnapshot,
  artifact: TaskReconciliationResultType["artifact"],
  state: TaskState,
  finalMessage: string,
  approvalRequest?: ApprovalRequest,
): TaskReconciliationResultType {
  return TaskReconciliationResult.parse({
    reconciliation_id: deterministicReconciliationId({ task_id: input.scoped_task.task_id, status, errors: state.errors }),
    task_id: input.scoped_task.task_id,
    task_run_id: input.task_run_id,
    status,
    capability_snapshot: capabilitySnapshot,
    artifact,
    executed_intents: state.executed,
    skipped_intents: state.skipped,
    observations: state.observations,
    errors: state.errors,
    final_message: finalMessage,
    approval_request: approvalRequest,
  });
}

function failedTaskResult(
  taskId: string,
  taskRunId: string,
  now: string,
  capabilitySnapshot: CapabilitySnapshot | undefined,
  observations: readonly Observation[],
  errors: readonly StructuredError[],
  finalMessage: string,
): TaskReconciliationResultType {
  const emptySnapshot = capabilitySnapshot ?? {
    snapshot_id: "caps_invalid",
    created_at: now,
    capabilities_hash: "0".repeat(64),
    capabilities: [],
  };
  return TaskReconciliationResult.parse({
    reconciliation_id: deterministicReconciliationId({ taskId, errors }),
    task_id: taskId,
    task_run_id: taskRunId,
    status: "failed",
    capability_snapshot: emptySnapshot,
    executed_intents: [],
    skipped_intents: [],
    observations,
    errors,
    final_message: finalMessage,
  });
}
