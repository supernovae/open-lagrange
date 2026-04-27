import * as restate from "@restatedev/restate-sdk";
import { runCognitiveStep } from "../activities/cognition.js";
import {
  findCapability,
  discoverMockMcpEndpoints,
  executeMockMcpCapability,
  type McpExecutionInput,
  type McpExecutionOutput,
  validateJsonLikeInput,
  validateMcpResult,
} from "../mcp/mock-registry.js";
import type { CapabilityDescriptor, CapabilitySnapshot } from "../schemas/capabilities.js";
import {
  CognitiveArtifact,
  type CognitiveArtifact as CognitiveArtifactType,
  type ExecutionIntent,
  type Observation,
  type ReconciliationError,
  type ReconciliationErrorCode,
  ReconciliationResult,
  type ReconciliationResult as ReconciliationResultType,
} from "../schemas/open-cot.js";
import {
  type ExecutionBounds,
  evaluateMockPolicy,
} from "../policy/policy-gate.js";
import { newId } from "../util/hash.js";

export interface ReconcilerInput {
  readonly user_prompt: string;
  readonly bounds?: Partial<ExecutionBounds>;
}

interface ReconciliationAccumulator {
  readonly observations: Observation[];
  readonly errors: ReconciliationError[];
  readonly executed: ExecutionIntent[];
  readonly skipped: ExecutionIntent[];
}

export interface ReconciliationRuntime {
  readonly execute_mcp: (input: McpExecutionInput) => Promise<McpExecutionOutput>;
}

const DEFAULT_BOUNDS: ExecutionBounds = {
  max_execution_intents: 3,
  max_total_execution_attempts: 3,
  max_risk_without_approval: "read",
};

export async function runReconciliation(
  input: ReconcilerInput,
  capabilitySnapshot: CapabilitySnapshot,
  artifactCandidate: unknown,
  runtime: ReconciliationRuntime = { execute_mcp: executeMockMcpCapability },
): Promise<ReconciliationResultType> {
  const bounds = { ...DEFAULT_BOUNDS, ...input.bounds };
  const parsed = CognitiveArtifact.safeParse(artifactCandidate);
  if (!parsed.success) {
    return ReconciliationResult.parse({
      reconciliation_id: newId("reconciliation"),
      status: "failed",
      capability_snapshot: capabilitySnapshot,
      executed_intents: [],
      skipped_intents: [],
      observations: [observation({
        status: "error",
        summary: "Cognitive artifact failed schema validation",
        error: error("INVALID_ARTIFACT", parsed.error.message),
      })],
      errors: [error("INVALID_ARTIFACT", parsed.error.message)],
      final_message: "The cognitive artifact was invalid.",
    });
  }

  const artifact = parsed.data;
  const state: ReconciliationAccumulator = {
    observations: [...artifact.observations],
    errors: [],
    executed: [],
    skipped: [],
  };

  if (artifact.capability_snapshot_id !== capabilitySnapshot.snapshot_id) {
    const item = error("SNAPSHOT_MISMATCH", "Artifact references a different capability snapshot");
    return finish("failed", capabilitySnapshot, artifact, state, item, "Capability snapshot mismatch.");
  }

  if (artifact.execution_intents.length === 0) {
    const item = error("YIELDED", artifact.yield_reason ?? "No execution intent emitted");
    return finish("yielded", capabilitySnapshot, artifact, state, item, "The pipeline yielded without execution.");
  }

  if (artifact.execution_intents.length > bounds.max_execution_intents) {
    const item = error("BUDGET_EXCEEDED", "Too many execution intents emitted");
    return finish("failed", capabilitySnapshot, artifact, state, item, "Execution intent bound exceeded.");
  }

  for (const intent of artifact.execution_intents) {
    const prepared = prepareIntent(intent, capabilitySnapshot, bounds);
    if (!prepared.ok) {
      state.skipped.push(intent);
      state.errors.push(prepared.error);
      state.observations.push(observation({
        intent_id: intent.intent_id,
        status: "error",
        summary: prepared.error.message,
        error: prepared.error,
      }));
      continue;
    }

    const policyResult = evaluateMockPolicy({
      user_prompt: input.user_prompt,
      capability: prepared.capability,
      intent,
      bounds,
      execution_attempts_used: state.executed.length + state.skipped.length,
    });

    if (policyResult.outcome !== "allow") {
      const code = policyResult.outcome === "requires_approval"
        ? "APPROVAL_REQUIRED"
        : policyResult.outcome === "yield"
          ? "YIELDED"
          : "POLICY_DENIED";
      const item = error(code, policyResult.reason, intent.intent_id);
      state.skipped.push(intent);
      state.errors.push(item);
      state.observations.push(observation({
        intent_id: intent.intent_id,
        status: policyResult.outcome === "yield" ? "skipped" : "error",
        summary: policyResult.reason,
        error: item,
      }));
      if (policyResult.outcome === "requires_approval") {
        return result("requires_approval", capabilitySnapshot, artifact, state, "Approval is required.");
      }
      if (policyResult.outcome === "yield") {
        return result("yielded", capabilitySnapshot, artifact, state, "The pipeline yielded at the policy gate.");
      }
      continue;
    }

    if (!preconditionsPass(intent)) {
      const item = error("PRECONDITION_FAILED", "Intent precondition failed", intent.intent_id);
      state.skipped.push(intent);
      state.errors.push(item);
      state.observations.push(observation({
        intent_id: intent.intent_id,
        status: "error",
        summary: item.message,
        error: item,
      }));
      continue;
    }

    const output = await runtime.execute_mcp({
      endpoint_id: intent.endpoint_id,
      capability_name: intent.capability_name,
      arguments: intent.arguments,
      idempotency_key: intent.idempotency_key,
    });

    if (output.status !== "ok") {
      const item = error("ENDPOINT_EXECUTION_FAILED", output.message, intent.intent_id);
      state.skipped.push(intent);
      state.errors.push(item);
      state.observations.push(observation({
        intent_id: intent.intent_id,
        status: "error",
        summary: output.message,
        error: item,
      }));
      continue;
    }

    const outputValidation = validateMcpResult(prepared.capability, output.result);
    if (!outputValidation.ok) {
      const item = error("RESULT_VALIDATION_FAILED", outputValidation.message, intent.intent_id);
      state.skipped.push(intent);
      state.errors.push(item);
      state.observations.push(observation({
        intent_id: intent.intent_id,
        status: "error",
        summary: item.message,
        output: output.result,
        error: item,
      }));
      continue;
    }

    state.executed.push(intent);
    state.observations.push(observation({
      intent_id: intent.intent_id,
      status: "recorded",
      summary: output.message,
      output: output.result,
    }));
  }

  if (state.executed.length === 0 && state.errors.length > 0) {
    return result("failed", capabilitySnapshot, artifact, state, "No execution intent completed.");
  }
  if (state.errors.length > 0) {
    return result("completed_with_errors", capabilitySnapshot, artifact, state, "Reconciliation completed with errors.");
  }
  return result("completed", capabilitySnapshot, artifact, state, "Reconciliation completed.");
}

export const cognitiveReconciler = restate.workflow({
  name: "cognitive-reconciler",
  handlers: {
    run: async (
      ctx: restate.WorkflowContext,
      input: ReconcilerInput,
    ): Promise<ReconciliationResultType> => {
      const capabilitySnapshot = await ctx.run("discover-mcp-endpoints", async () =>
        discoverMockMcpEndpoints(),
      );

      const artifact = await ctx.run("run-cognitive-step", async () =>
        runCognitiveStep({
          user_prompt: input.user_prompt,
          capability_snapshot: capabilitySnapshot,
        }),
      );
      // Restate journals completed run steps. If a process stops after this
      // expensive cognitive step, recovery resumes from the journaled artifact
      // instead of repeating inference.

      return runReconciliation(input, capabilitySnapshot, artifact, {
        execute_mcp: async (request) =>
          ctx.run(`execute-mcp-${request.endpoint_id}-${request.capability_name}`, async () =>
            executeMockMcpCapability(request),
          ),
      });
    },
  },
});

function prepareIntent(
  intent: ExecutionIntent,
  snapshot: CapabilitySnapshot,
  bounds: ExecutionBounds,
): { readonly ok: true; readonly capability: CapabilityDescriptor } | { readonly ok: false; readonly error: ReconciliationError } {
  if (intent.snapshot_id !== snapshot.snapshot_id) {
    return { ok: false, error: error("SNAPSHOT_MISMATCH", "Intent references a different snapshot", intent.intent_id) };
  }
  const serverExists = snapshot.capabilities.some(
    (capability) => capability.endpoint_id === intent.endpoint_id,
  );
  if (!serverExists) {
    return { ok: false, error: error("UNKNOWN_ENDPOINT", "Requested endpoint is not in snapshot", intent.intent_id) };
  }
  const capability = findCapability(snapshot, intent.endpoint_id, intent.capability_name);
  if (!capability) {
    return { ok: false, error: error("UNKNOWN_CAPABILITY", "Requested capability is not in snapshot", intent.intent_id) };
  }
  if (capability.capability_digest !== intent.capability_digest) {
    return { ok: false, error: error("CAPABILITY_DIGEST_MISMATCH", "Capability digest does not match snapshot", intent.intent_id) };
  }
  const argumentValidation = validateJsonLikeInput(capability.input_schema, intent.arguments);
  if (!argumentValidation.ok) {
    return { ok: false, error: error("SCHEMA_VALIDATION_FAILED", argumentValidation.message, intent.intent_id) };
  }
  if (bounds.max_total_execution_attempts <= 0) {
    return { ok: false, error: error("BUDGET_EXCEEDED", "Execution attempt bound is exhausted", intent.intent_id) };
  }
  return { ok: true, capability };
}

function preconditionsPass(intent: ExecutionIntent): boolean {
  return !(intent.preconditions ?? []).some((condition) =>
    condition.toLowerCase().includes("fail"),
  );
}

function finish(
  status: ReconciliationResultType["status"],
  snapshot: CapabilitySnapshot,
  artifact: CognitiveArtifactType,
  state: ReconciliationAccumulator,
  item: ReconciliationError,
  message: string,
): ReconciliationResultType {
  state.errors.push(item);
  state.observations.push(observation({
    status: "error",
    summary: item.message,
    error: item,
  }));
  return result(status, snapshot, artifact, state, message);
}

function result(
  status: ReconciliationResultType["status"],
  snapshot: CapabilitySnapshot,
  artifact: CognitiveArtifactType,
  state: ReconciliationAccumulator,
  finalMessage: string,
): ReconciliationResultType {
  return ReconciliationResult.parse({
    reconciliation_id: newId("reconciliation"),
    status,
    capability_snapshot: snapshot,
    artifact,
    executed_intents: state.executed,
    skipped_intents: state.skipped,
    observations: state.observations,
    errors: state.errors,
    final_message: finalMessage,
  });
}

function error(
  code: ReconciliationErrorCode,
  message: string,
  intent_id?: string,
): ReconciliationError {
  return {
    code,
    message,
    intent_id,
    observed_at: new Date().toISOString(),
  };
}

function observation(input: {
  readonly intent_id?: string;
  readonly status: Observation["status"];
  readonly summary: string;
  readonly output?: unknown;
  readonly error?: ReconciliationError;
}): Observation {
  return {
    observation_id: newId("observation"),
    intent_id: input.intent_id,
    status: input.status,
    summary: input.summary,
    output: input.output,
    observed_at: new Date().toISOString(),
  };
}
