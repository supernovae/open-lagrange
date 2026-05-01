import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { WorkOrder, type WorkOrder as WorkOrderType } from "../planning/work-order.js";
import type { Planfile, PlanNode } from "../planning/planfile-schema.js";
import { stableHash } from "../util/hash.js";
import type { EvidenceBundle } from "./evidence-bundle.js";
import type { PatchPolicy, RepositoryPatchPlan, ScopeExpansionRequest } from "./patch-plan.js";
import type { VerificationFailure } from "./verification-report.js";
import { chooseModelForRole, type RepositoryModelRole } from "./model-router.js";
import { modelProviderUnavailable, PatchPlanGenerationError } from "./patch-plan-generation-errors.js";
import { buildPatchPlanPrompt, patchPlanSystemPrompt, redactedPatchPlanContext } from "./patch-plan-prompt.js";
import { ModelPatchPlanOutput, normalizeModelPatchPlanOutput } from "./patch-plan-output-schema.js";
import { executeModelRoleCall, ModelRoleCallError, type ModelRoleTraceContext } from "../models/model-route-executor.js";

export interface GeneratePatchPlanFromEvidenceInput {
  readonly plan_id: string;
  readonly node_id: string;
  readonly work_order: WorkOrderType;
  readonly evidence_bundle: EvidenceBundle;
  readonly allowed_files: readonly string[];
  readonly denied_files: readonly string[];
  readonly acceptance_criteria: readonly string[];
  readonly non_goals: readonly string[];
  readonly constraints: readonly string[];
  readonly patch_policy: PatchPolicy;
  readonly latest_failures?: readonly VerificationFailure[];
  readonly current_diff_summary?: string;
  readonly mode: "initial_patch" | "repair";
  readonly model_role_hint: Extract<RepositoryModelRole, "implementer_small" | "repair_small" | "escalation_strong">;
  readonly trace_context?: ModelRoleTraceContext;
  readonly persist_telemetry?: boolean;
}

export type PatchPlanGenerator = (input: GeneratePatchPlanFromEvidenceInput) => Promise<RepositoryPatchPlan>;

export async function generatePatchPlanFromEvidence(input: GeneratePatchPlanFromEvidenceInput): Promise<RepositoryPatchPlan> {
  const modelChoice = chooseModelForRole(input.model_role_hint);
  try {
    const result = await executeModelRoleCall({
      role: input.mode === "repair" ? "repair" : input.model_role_hint === "escalation_strong" ? "repair" : "implementer",
      model_ref: {
        provider: process.env.OPEN_LAGRANGE_MODEL_PROVIDER ?? "openai",
        model: modelChoice.model,
        role_label: input.mode === "repair" ? "repair" : "implementer",
      },
      schema: ModelPatchPlanOutput,
      system: patchPlanSystemPrompt(),
      prompt: buildPatchPlanPrompt(input),
      trace_context: {
        ...input.trace_context,
        plan_id: input.plan_id,
        node_id: input.node_id,
        work_order_id: input.work_order.work_order_id,
        input_artifact_refs: [
          ...(input.trace_context?.input_artifact_refs ?? []),
          input.evidence_bundle.artifact_id,
        ],
        output_schema_name: "PatchPlan",
      },
      persist_telemetry: input.persist_telemetry ?? false,
    });
    return normalizeModelPatchPlanOutput(result.object);
  } catch (caught) {
    if (caught instanceof ModelRoleCallError && caught.code === "MODEL_PROVIDER_UNAVAILABLE") throw modelProviderUnavailable();
    if (caught instanceof PatchPlanGenerationError) throw caught;
    throw new PatchPlanGenerationError("PATCH_PLAN_GENERATION_FAILED", caught instanceof Error ? caught.message : String(caught));
  }
}

export function createPatchPlanWorkOrder(input: {
  readonly plan: Planfile;
  readonly node: PlanNode;
  readonly evidence: EvidenceBundle;
  readonly latest_failures?: readonly VerificationFailure[];
  readonly max_attempts?: number;
}): WorkOrderType {
  return WorkOrder.parse({
    work_order_id: `work_order_${stableHash({ plan: input.plan.plan_id, node: input.node.id, evidence: input.evidence.evidence_bundle_id, failures: input.latest_failures?.map((failure) => failure.summary) ?? [] }).slice(0, 18)}`,
    plan_id: input.plan.plan_id,
    node_id: input.node.id,
    phase: input.node.kind,
    objective: input.node.objective,
    acceptance_criteria: acceptanceForNode(input.plan, input.node),
    non_goals: input.plan.goal_frame.non_goals,
    assumptions: input.plan.goal_frame.assumptions,
    constraints: [
      `risk_level:${input.node.risk_level}`,
      `approval_required:${input.node.approval_required}`,
      ...input.node.allowed_capability_refs.map((ref) => `capability:${ref}`),
      ...(input.node.verification_command_ids ?? input.plan.verification_policy.allowed_command_ids).map((commandId) => `verification_command:${commandId}`),
    ],
    allowed_capability_snapshot: createCapabilitySnapshotForTask({
      allowed_capabilities: input.node.allowed_capability_refs,
      allowed_scopes: ["repository:read", "repository:write", "repository:verify"],
      max_risk_level: input.node.risk_level,
      now: new Date().toISOString(),
    }),
    input_artifacts: [input.evidence.artifact_id],
    required_output_schema: { type: "object" },
    relevant_evidence: [input.evidence.evidence_bundle_id, ...input.evidence.files.map((file) => file.path)],
    latest_failures: input.latest_failures?.map((failure) => `${failure.command_id}: ${failure.summary}`) ?? [],
    max_attempts: input.max_attempts ?? 1,
    model_role_hint: input.node.kind === "repair" ? "repair" : "implementer",
  });
}

export function patchPlanContextSummary(input: GeneratePatchPlanFromEvidenceInput): Record<string, unknown> {
  return {
    context_id: `patch_context_${stableHash(redactedPatchPlanContext(input)).slice(0, 18)}`,
    ...redactedPatchPlanContext(input),
  };
}

export function defaultPatchPolicy(input: {
  readonly allowed_files: readonly string[];
  readonly denied_files?: readonly string[];
  readonly allowed_verification_command_ids: readonly string[];
}): PatchPolicy {
  return {
    allowed_files: [...input.allowed_files],
    denied_files: [...(input.denied_files ?? [])],
    allow_full_replacement: true,
    full_replacement_max_bytes: 32_000,
    allow_ambiguous_anchors: false,
    allowed_verification_command_ids: [...input.allowed_verification_command_ids],
  };
}

export function validateScopeExpansionRequest(input: {
  readonly request: ScopeExpansionRequest;
  readonly plan_id: string;
  readonly node_id: string;
  readonly evidence_refs: readonly string[];
}): ScopeExpansionRequest {
  if (input.request.plan_id !== input.plan_id || input.request.node_id !== input.node_id) {
    throw new PatchPlanGenerationError("PATCH_PLAN_GENERATION_FAILED", "Scope expansion request does not match the active node.");
  }
  const known = new Set(input.evidence_refs);
  for (const ref of input.request.evidence_refs) {
    if (!known.has(ref)) throw new PatchPlanGenerationError("PATCH_PLAN_GENERATION_FAILED", `Unknown scope expansion evidence ref: ${ref}`);
  }
  return input.request;
}

function acceptanceForNode(plan: Planfile, node: PlanNode): readonly string[] {
  return node.acceptance_refs.map((ref) => {
    const match = /^acceptance:(\d+)$/.exec(ref);
    if (match) return plan.goal_frame.acceptance_criteria[Number(match[1]) - 1] ?? ref;
    return plan.goal_frame.acceptance_criteria.find((criterion) => criterion === ref) ?? ref;
  });
}
