import { generateObject } from "ai";
import {
  deterministicIdempotencyKey,
  deterministicIntentId,
  deterministicObservationId,
} from "../ids/deterministic-ids.js";
import { createConfiguredLanguageModel } from "../model-providers/index.js";
import type { CapabilityDescriptor, CapabilitySnapshot } from "../schemas/capabilities.js";
import type { DelegationContext } from "../schemas/delegation.js";
import { CognitiveArtifact, type CognitiveArtifact as CognitiveArtifactType } from "../schemas/open-cot.js";
import { CriticResult, ExecutionPlan, type CriticResult as CriticResultType, type ExecutionPlan as ExecutionPlanType, type ScopedTask } from "../schemas/reconciliation.js";

export interface GenerateExecutionPlanInput {
  readonly goal: string;
  readonly delegation_context: DelegationContext;
  readonly metadata?: Record<string, unknown>;
  readonly max_tasks: number;
}

export interface GenerateTaskArtifactInput {
  readonly scoped_task: ScopedTask;
  readonly delegation_context: DelegationContext;
  readonly capability_snapshot: CapabilitySnapshot;
  readonly prior_observations?: readonly unknown[];
}

export async function generateExecutionPlan(input: GenerateExecutionPlanInput): Promise<ExecutionPlanType> {
  const model = createConfiguredLanguageModel("high");
  if (!model) return deterministicExecutionPlan(input);
  const { object } = await generateObject({
    model,
    schema: ExecutionPlan,
    system: [
      "Emit a structured execution plan only.",
      "You do not execute endpoint capabilities.",
      "The runtime will validate every field as untrusted input.",
      "Use small scoped tasks that stay inside the provided delegation context.",
    ].join("\n"),
    prompt: JSON.stringify(input),
  });
  return ExecutionPlan.parse(object);
}

export async function generateTaskArtifact(input: GenerateTaskArtifactInput): Promise<CognitiveArtifactType> {
  const model = createConfiguredLanguageModel("default");
  if (!model) return deterministicTaskArtifact(input);
  const { object } = await generateObject({
    model,
    schema: CognitiveArtifact,
    system: [
      "Emit a structured cognitive artifact only.",
      "You cannot execute endpoint capabilities.",
      "You cannot call MCP.",
      "Only reference capabilities present in the injected capability snapshot.",
      "Do not invent endpoints, capabilities, or digests.",
      "The workflow validates all output before execution.",
    ].join("\n"),
    prompt: JSON.stringify(input),
  });
  return CognitiveArtifact.parse(object);
}

export async function runMockCritic(input: {
  readonly scoped_task: ScopedTask;
  readonly output: unknown;
  readonly force_outcome?: CriticResultType["outcome"];
}): Promise<CriticResultType> {
  return CriticResult.parse({
    outcome: input.force_outcome ?? "pass",
    summary: input.force_outcome === "revise"
      ? "Revision requested, but recursive revision is unsupported in this slice."
      : `Checked result for ${input.scoped_task.title}.`,
  });
}

function deterministicExecutionPlan(input: GenerateExecutionPlanInput): ExecutionPlanType {
  const projectId = input.delegation_context.project_id;
  return ExecutionPlan.parse({
    plan_id: `plan_${projectId.replace(/^project_/, "")}`,
    schema_version: "open-cot.execution-plan.v1",
    project_id: projectId,
    plan_version: "v1",
    goal: input.goal,
    tasks: [{
      task_id: `task_${projectId.replace(/^project_/, "").slice(0, 16)}_summary`,
      title: "Create README summary",
      objective: input.goal,
      allowed_scopes: ["project:read", "project:summarize"],
      allowed_capabilities: ["read_file", "draft_readme_summary"],
      max_risk_level: "read",
    }].slice(0, input.max_tasks),
    assumptions: ["Deterministic fallback used because no provider key is configured."],
  });
}

function deterministicTaskArtifact(input: GenerateTaskArtifactInput): CognitiveArtifactType {
  const preferred = chooseCapability(input.capability_snapshot.capabilities);
  const execution_intents = preferred ? [{
    intent_id: deterministicIntentId({
      task_id: input.scoped_task.task_id,
      endpoint_id: preferred.endpoint_id,
      capability_name: preferred.capability_name,
    }),
    snapshot_id: input.capability_snapshot.snapshot_id,
    endpoint_id: preferred.endpoint_id,
    capability_name: preferred.capability_name,
    capability_digest: preferred.capability_digest,
    risk_level: preferred.risk_level,
    requires_approval: preferred.requires_approval,
    idempotency_key: deterministicIdempotencyKey({
      task_id: input.scoped_task.task_id,
      capability_name: preferred.capability_name,
    }),
    arguments: argumentsFor(input.scoped_task, preferred),
    preconditions: ["Capability appears in the injected snapshot"],
    expected_result_shape: preferred.output_schema,
    postconditions: ["Record a structured observation"],
  }] : [];

  return CognitiveArtifact.parse({
    artifact_id: `artifact_${input.scoped_task.task_id}`,
    schema_version: "open-cot.core.v1",
    capability_snapshot_id: input.capability_snapshot.snapshot_id,
    intent_verification: {
      objective: input.scoped_task.objective,
      request_boundaries: ["Use only injected capabilities", "Do not assume ambient execution"],
      allowed_scope: input.capability_snapshot.capabilities.map(
        (capability) => `${capability.endpoint_id}.${capability.capability_name}`,
      ),
      prohibited_scope: ["Capabilities absent from the snapshot", "Direct side effects outside policy"],
    },
    assumptions: ["Deterministic fallback used because no provider key is configured."],
    reasoning_trace: {
      evidence_mode: "audit_summary",
      summary: preferred ? "Selected a capability from the injected snapshot." : "No compatible capability was available.",
      steps: [{
        step_id: deterministicObservationId({ task_id: input.scoped_task.task_id, kind: "trace" }),
        kind: preferred ? "verification" : "yield",
        content: preferred ? "Capability selection was bounded by the snapshot." : "The snapshot did not contain a matching capability.",
        visibility: "audit_summary",
        confidence: preferred ? 0.86 : 0.42,
      }],
    },
    execution_intents,
    observations: [],
    uncertainty: {
      level: preferred ? "low" : "medium",
      explanation: preferred ? "A matching mocked capability was found." : "No matching capability was found.",
    },
    yield_reason: preferred ? undefined : "No compatible capability in snapshot",
  });
}

function chooseCapability(capabilities: readonly CapabilityDescriptor[]): CapabilityDescriptor | undefined {
  return capabilities.find((capability) => capability.capability_name === "draft_readme_summary")
    ?? capabilities.find((capability) => capability.capability_name === "read_file")
    ?? capabilities[0];
}

function argumentsFor(task: ScopedTask, capability: CapabilityDescriptor): Record<string, unknown> {
  if (capability.capability_name === "draft_readme_summary") {
    return {
      title: "README summary",
      source_summary: "The repository contains a durable TypeScript reconciliation runtime.",
    };
  }
  if (capability.capability_name === "read_file") return { path: "README.md" };
  if (capability.capability_name === "search_docs") return { query: task.objective };
  return { path: "notes/summary.md", content: task.objective };
}
