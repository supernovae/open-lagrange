import type { PackExecutionContext, PackRegistry } from "@open-lagrange/capability-sdk";
import { CapabilityStepInput, CapabilityStepResult, type CapabilityStepInput as CapabilityStepInputType, type CapabilityStepResult as CapabilityStepResultType } from "./capability-step-schema.js";
import { resolveCapabilityForStep, sdkDescriptorToPolicyCapability } from "./capability-step.js";
import { evaluatePolicyWithReport } from "../policy/policy-gate.js";
import { buildPackExecutionContext } from "../capability-registry/context.js";
import { packRegistry } from "../capability-registry/registry.js";
import { DEFAULT_EXECUTION_BOUNDS, type ExecutionBounds, type ScopedTask } from "../schemas/reconciliation.js";
import { observation, structuredError } from "../reconciliation/records.js";
import type { PlanState, PlanStateStore } from "../planning/plan-state.js";
import { PlanState as PlanStateSchema } from "../planning/plan-state.js";
import type { PlanArtifactRef } from "../planning/plan-artifacts.js";
import type { ExecutionIntent } from "../schemas/open-cot.js";

export interface CapabilityStepRunnerOptions {
  readonly registry?: PackRegistry;
  readonly now?: string;
  readonly scoped_task?: ScopedTask;
  readonly bounds?: ExecutionBounds;
  readonly endpoint_attempts_used?: number;
  readonly runtime_config?: Record<string, unknown>;
  readonly plan_state?: PlanState;
  readonly plan_state_store?: PlanStateStore;
  readonly record_artifact?: PackExecutionContext["recordArtifact"];
  readonly record_observation?: PackExecutionContext["recordObservation"];
  readonly record_status?: PackExecutionContext["recordStatus"];
}

export async function runCapabilityStep(
  rawInput: CapabilityStepInputType,
  options: CapabilityStepRunnerOptions,
): Promise<CapabilityStepResultType> {
  const started = Date.now();
  const input = CapabilityStepInput.parse(rawInput);
  const registry = options.registry ?? packRegistry;
  const now = options.now ?? new Date().toISOString();
  const resolved = resolveCapabilityForStep(registry, input.capability_ref);
  if (!resolved) return finishFailure(input, started, now, "UNKNOWN_CAPABILITY", `Unknown capability: ${input.capability_ref}`, options);
  if (resolved.descriptor.capability_digest !== input.capability_digest) {
    return finishFailure(input, started, now, "CAPABILITY_DIGEST_MISMATCH", "Capability digest does not match current registry descriptor.", options);
  }

  const parsedInput = resolved.definition.input_schema.safeParse(input.input);
  if (!parsedInput.success) {
    return finishFailure(input, started, now, "SCHEMA_VALIDATION_FAILED", parsedInput.error.message, options);
  }

  const intent = intentFromStep(input, resolved.descriptor);
  const scopedTask = options.scoped_task ?? scopedTaskFromStep(input, resolved.descriptor);
  const policy = evaluatePolicyWithReport({
    delegation_context: input.delegation_context,
    scoped_task: scopedTask,
    capability: sdkDescriptorToPolicyCapability(resolved.descriptor),
    intent,
    bounds: options.bounds ?? DEFAULT_EXECUTION_BOUNDS,
    endpoint_attempts_used: options.endpoint_attempts_used ?? 0,
    now,
  });
  if (policy.result.outcome === "deny" || policy.result.outcome === "yield") {
    const status = policy.result.outcome === "yield" ? "yielded" : "failed";
    return finish(input, started, now, {
      status,
      policy_report: policy.report,
      structured_errors: [structuredError({
        code: policy.result.outcome === "yield" ? "YIELDED" : "POLICY_DENIED",
        message: policy.result.reason,
        now,
        task_id: input.node_id,
        intent_id: intent.intent_id,
      })],
      observations: [observation({ status: status === "failed" ? "error" : "skipped", summary: policy.result.reason, now, task_id: input.node_id, intent_id: intent.intent_id })],
    }, options);
  }
  if (policy.result.outcome === "requires_approval") {
    return finish(input, started, now, {
      status: "requires_approval",
      policy_report: policy.report,
      structured_errors: [structuredError({ code: "APPROVAL_REQUIRED", message: policy.result.reason, now, task_id: input.node_id, intent_id: intent.intent_id })],
      observations: [observation({ status: "skipped", summary: policy.result.reason, now, task_id: input.node_id, intent_id: intent.intent_id })],
    }, options);
  }

  const outputArtifactRefs: string[] = [];
  const context = buildPackExecutionContext({
    delegation_context: input.delegation_context,
    capability_snapshot_id: `step_${input.plan_id}`,
    project_id: input.delegation_context.project_id,
    workspace_id: input.delegation_context.workspace_id,
    task_run_id: input.delegation_context.task_run_id ?? input.node_id,
    trace_id: input.delegation_context.trace_id,
    idempotency_key: input.idempotency_key,
    policy_decision: policy.result,
    execution_bounds: options.bounds ?? DEFAULT_EXECUTION_BOUNDS,
    timeout_ms: resolved.descriptor.timeout_ms,
    runtime_config: options.runtime_config ?? {},
  });
  const executionContext: PackExecutionContext = {
    ...context,
    async recordArtifact(artifact) {
      const refs = artifactRefs(artifact);
      outputArtifactRefs.push(...refs);
      await options.record_artifact?.(withLineage(artifact, input, resolved.descriptor));
    },
    async recordObservation(item) {
      await options.record_observation?.(item);
    },
    async recordStatus(status) {
      await options.record_status?.(status);
    },
  };

  const result = await registry.executeCapability({ capability_id: resolved.descriptor.capability_id }, parsedInput.data, executionContext).catch(() => undefined);
  if (!result) {
    return finish(input, started, now, {
      status: "failed",
      policy_report: policy.report,
      output_artifact_refs: outputArtifactRefs,
      structured_errors: [structuredError({ code: "MCP_EXECUTION_FAILED", message: "Capability execution failed before returning a result.", now, task_id: input.node_id, intent_id: intent.intent_id })],
      observations: [observation({ status: "error", summary: "Capability execution failed before returning a result.", now, task_id: input.node_id, intent_id: intent.intent_id })],
    }, options);
  }
  outputArtifactRefs.push(...result.artifacts.flatMap(artifactRefs));
  const outputValidation = result.output === undefined ? { success: true as const, data: undefined } : resolved.definition.output_schema.safeParse(result.output);
  if (!outputValidation.success) {
    return finish(input, started, now, {
      status: "failed",
      policy_report: policy.report,
      output_artifact_refs: outputArtifactRefs,
      structured_errors: [structuredError({ code: "RESULT_VALIDATION_FAILED", message: outputValidation.error.message, now, task_id: input.node_id, intent_id: intent.intent_id })],
      observations: [observation({ status: "error", summary: "Capability output failed validation.", now, task_id: input.node_id, intent_id: intent.intent_id })],
    }, options);
  }

  const structuredErrors = result.structured_errors.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return structuredError({
      code: normalizeErrorCode(typeof record.code === "string" ? record.code : "MCP_EXECUTION_FAILED"),
      message: typeof record.message === "string" ? record.message : "Capability execution failed.",
      now,
      task_id: input.node_id,
      intent_id: intent.intent_id,
    });
  });
  const status = result.status === "success" ? "completed" : result.status === "requires_approval" ? "requires_approval" : result.status === "yielded" ? "yielded" : "failed";
  return finish(input, started, now, {
    status,
    ...(result.output === undefined ? {} : { output: result.output }),
    output_artifact_refs: outputArtifactRefs,
    policy_report: policy.report,
    structured_errors: structuredErrors,
    observations: [
      observation({
        status: status === "completed" ? "recorded" : status === "failed" ? "error" : "skipped",
        summary: status === "completed" ? "Capability step completed." : `Capability step ${status}.`,
        now,
        task_id: input.node_id,
        intent_id: intent.intent_id,
        ...(result.output === undefined ? {} : { output: result.output }),
      }),
    ],
  }, options);
}

function intentFromStep(input: CapabilityStepInputType, descriptor: { readonly pack_id: string; readonly name: string; readonly capability_digest: string; readonly risk_level: ExecutionIntent["risk_level"]; readonly requires_approval: boolean }): ExecutionIntent {
  return {
    intent_id: `${input.plan_id}:${input.node_id}:${descriptor.name}`,
    snapshot_id: `step_${input.plan_id}`,
    endpoint_id: descriptor.pack_id,
    capability_name: descriptor.name,
    capability_digest: descriptor.capability_digest,
    risk_level: descriptor.risk_level,
    requires_approval: descriptor.requires_approval,
    idempotency_key: input.idempotency_key,
    arguments: typeof input.input === "object" && input.input !== null && !Array.isArray(input.input) ? input.input as Record<string, unknown> : { value: input.input },
  };
}

function scopedTaskFromStep(input: CapabilityStepInputType, descriptor: { readonly name: string; readonly capability_id: string; readonly scopes: readonly string[]; readonly risk_level: ScopedTask["max_risk_level"] }): ScopedTask {
  return {
    task_id: input.node_id,
    title: `Capability step ${input.node_id}`,
    objective: `Run ${descriptor.name}`,
    allowed_scopes: [...descriptor.scopes],
    allowed_capabilities: [descriptor.name, descriptor.capability_id],
    max_risk_level: descriptor.risk_level,
  };
}

async function finishFailure(
  input: CapabilityStepInputType,
  started: number,
  now: string,
  code: Parameters<typeof structuredError>[0]["code"],
  message: string,
  options: CapabilityStepRunnerOptions,
): Promise<CapabilityStepResultType> {
  return finish(input, started, now, {
    status: "failed",
    structured_errors: [structuredError({ code, message, now, task_id: input.node_id })],
    observations: [observation({ status: "error", summary: message, now, task_id: input.node_id })],
  }, options);
}

async function finish(
  input: CapabilityStepInputType,
  started: number,
  now: string,
  partial: {
    readonly status: CapabilityStepResultType["status"];
    readonly output?: unknown;
    readonly output_artifact_refs?: readonly string[];
    readonly policy_report?: CapabilityStepResultType["policy_report"];
    readonly observations?: CapabilityStepResultType["observations"];
    readonly structured_errors?: CapabilityStepResultType["structured_errors"];
  },
  options: CapabilityStepRunnerOptions,
): Promise<CapabilityStepResultType> {
  const result = CapabilityStepResult.parse({
    status: partial.status,
    ...(partial.output === undefined ? {} : { output: partial.output }),
    output_artifact_refs: partial.output_artifact_refs ?? [],
    ...(partial.policy_report ? { policy_report: partial.policy_report } : {}),
    observations: partial.observations ?? [],
    structured_errors: partial.structured_errors ?? [],
    duration_ms: Math.max(0, Date.now() - started),
  });
  if (options.plan_state && options.plan_state_store) {
    await options.plan_state_store.recordPlanState(updatePlanState(options.plan_state, input, result, now));
  }
  return result;
}

function updatePlanState(state: PlanState, input: CapabilityStepInputType, result: CapabilityStepResultType, now: string): PlanState {
  const node_states = state.node_states.map((node) => node.node_id === input.node_id ? {
    ...node,
    status: result.status === "completed" ? "completed" : result.status === "requires_approval" ? "yielded" : result.status,
    completed_at: now,
    artifacts: [...node.artifacts, ...result.output_artifact_refs.map((artifactId) => planArtifactRef(artifactId, now))],
    errors: [...node.errors, ...result.structured_errors.map((error) => error.message)],
  } : node);
  return PlanStateSchema.parse({ ...state, node_states, updated_at: now });
}

function planArtifactRef(artifactId: string, now: string): PlanArtifactRef {
  return {
    artifact_id: artifactId,
    kind: "capability_step_result",
    path_or_uri: `artifact://${artifactId}`,
    summary: `Capability step artifact ${artifactId}`,
    created_at: now,
  };
}

function artifactRefs(artifact: unknown): string[] {
  const record = artifact && typeof artifact === "object" ? artifact as Record<string, unknown> : {};
  const direct = typeof record.artifact_id === "string" ? [record.artifact_id] : [];
  const lineage = record.lineage && typeof record.lineage === "object" ? record.lineage as Record<string, unknown> : {};
  const outputRefs = Array.isArray(lineage.output_artifact_refs) ? lineage.output_artifact_refs.filter((item): item is string => typeof item === "string") : [];
  return [...new Set([...direct, ...outputRefs])];
}

function withLineage(artifact: unknown, input: CapabilityStepInputType, descriptor: { readonly pack_id: string; readonly capability_id: string }): unknown {
  if (!artifact || typeof artifact !== "object") return artifact;
  const record = artifact as Record<string, unknown>;
  const lineage = record.lineage && typeof record.lineage === "object" ? record.lineage as Record<string, unknown> : {};
  return {
    ...record,
    lineage: {
      ...lineage,
      produced_by_pack_id: lineage.produced_by_pack_id ?? descriptor.pack_id,
      produced_by_capability_id: lineage.produced_by_capability_id ?? descriptor.capability_id,
      produced_by_plan_id: lineage.produced_by_plan_id ?? input.plan_id,
      produced_by_node_id: lineage.produced_by_node_id ?? input.node_id,
      input_artifact_refs: lineage.input_artifact_refs ?? input.input_artifact_refs,
    },
  };
}

function normalizeErrorCode(code: string): Parameters<typeof structuredError>[0]["code"] {
  const allowed = [
    "INVALID_ARTIFACT",
    "INVALID_PLAN",
    "INVALID_DELEGATION_CONTEXT",
    "SNAPSHOT_MISMATCH",
    "UNKNOWN_MCP_SERVER",
    "UNKNOWN_CAPABILITY",
    "CAPABILITY_DIGEST_MISMATCH",
    "SCHEMA_VALIDATION_FAILED",
    "POLICY_DENIED",
    "APPROVAL_REQUIRED",
    "PRECONDITION_FAILED",
    "BUDGET_EXCEEDED",
    "MCP_EXECUTION_FAILED",
    "RESULT_VALIDATION_FAILED",
    "CRITIC_FAILED",
    "REVISION_UNSUPPORTED",
    "YIELDED",
  ] as const;
  return allowed.includes(code as typeof allowed[number]) ? code as typeof allowed[number] : "MCP_EXECUTION_FAILED";
}
