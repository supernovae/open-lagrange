import { createConfiguredLanguageModel } from "../model-providers/index.js";
import { buildPatchPlanPrompt, patchPlanSystemPrompt } from "../repository/patch-plan-prompt.js";
import { ModelPatchPlanOutput, normalizeModelPatchPlanOutput } from "../repository/patch-plan-output-schema.js";
import type { GeneratePatchPlanFromEvidenceInput, PatchPlanGenerator } from "../repository/model-patch-plan-generator.js";
import { PatchPlanGenerationError, modelProviderUnavailable } from "../repository/patch-plan-generation-errors.js";
import type { RepositoryPatchPlan } from "../repository/patch-plan.js";
import { createModelReviewReportGenerator, type ReviewReportGenerator } from "../repository/model-review-report-generator.js";
import { executeModelRoleCall, ModelRoleCallError } from "../models/model-route-executor.js";
import type { ModelRouteConfig, ModelRef } from "./model-route-config.js";
import type { ModelUsageRecord } from "./provider-usage.js";

export interface LiveProviderPatchPlanGenerator {
  readonly generator: PatchPlanGenerator;
  readonly usage_records: readonly ModelUsageRecord[];
}

export function createLiveProviderPatchPlanGenerator(route: ModelRouteConfig, usageRecords: ModelUsageRecord[] = []): LiveProviderPatchPlanGenerator {
  const generator: PatchPlanGenerator = async (input) => {
    const modelRef = modelRefForPatchPlan(route, input);
    const prompt = buildPatchPlanPrompt(input);
    try {
      const result = await executeModelRoleCall({
        role: input.mode === "repair" ? "repair" : modelRef.role_label === "escalation" ? "escalation" : "implementer",
        model_ref: modelRef,
        schema: ModelPatchPlanOutput,
        system: patchPlanSystemPrompt(),
        prompt,
        trace_context: {
          route_id: route.route_id,
          plan_id: input.plan_id,
          node_id: input.node_id,
        },
      });
      const patchPlan = normalizeModelPatchPlanOutput(result.object);
      usageRecords.push(result.usage_record);
      return patchPlan;
    } catch (caught) {
      if (caught instanceof ModelRoleCallError && caught.code === "MODEL_PROVIDER_UNAVAILABLE") throw modelProviderUnavailable();
      if (caught instanceof PatchPlanGenerationError) throw caught;
      throw new PatchPlanGenerationError("PATCH_PLAN_GENERATION_FAILED", caught instanceof Error ? caught.message : String(caught));
    }
  };
  return {
    generator,
    get usage_records() {
      return usageRecords;
    },
  };
}

export function createLiveProviderReviewReportGenerator(route: ModelRouteConfig, usageRecords: ModelUsageRecord[] = [], scenarioId?: string): ReviewReportGenerator {
  return createModelReviewReportGenerator({
    route,
    telemetry_records: usageRecords,
    ...(scenarioId ? { scenario_id: scenarioId } : {}),
  });
}

export function hasLiveProviderForRoute(route: ModelRouteConfig, options: { readonly planning_mode?: "deterministic" | "model" | "model_with_deterministic_fallback" } = {}): boolean {
  if (!route.authoritative_apply) return true;
  const planningRefs = options.planning_mode === "model" ? [route.roles.planner] : [];
  return [...planningRefs, route.roles.implementer, route.roles.repair, route.roles.reviewer, route.roles.escalation].filter(Boolean).every((ref) =>
    Boolean(createConfiguredLanguageModel("default", {
      provider: (ref as ModelRef).provider,
      models: { default: (ref as ModelRef).model },
    })),
  );
}

function modelRefForPatchPlan(route: ModelRouteConfig, input: GeneratePatchPlanFromEvidenceInput): ModelRef {
  if (input.model_role_hint === "escalation_strong" && route.roles.escalation) return route.roles.escalation;
  if (input.mode === "repair") return route.roles.repair;
  return route.roles.implementer;
}

export function createPreviewPatchPlanGenerator(route: ModelRouteConfig): PatchPlanGenerator {
  return async (input): Promise<RepositoryPatchPlan> => {
    const file = input.evidence_bundle.files.find((candidate) => input.allowed_files.includes(candidate.path)) ?? input.evidence_bundle.files[0];
    if (!file) throw new PatchPlanGenerationError("PATCH_PLAN_GENERATION_FAILED", "Preview route has no evidence file to patch.");
    return {
      patch_plan_id: `preview_${route.route_id}_${input.node_id}`,
      plan_id: input.plan_id,
      node_id: input.node_id,
      summary: "Deterministic preview PatchPlan.",
      rationale: "Preview route records baseline behavior without live provider output.",
      evidence_refs: [input.evidence_bundle.evidence_bundle_id, file.path],
      operations: [{
        operation_id: "preview-noop",
        kind: "insert_after",
        relative_path: file.path,
        expected_sha256: file.sha256,
        anchor: file.excerpt.split("\n")[0] ?? "",
        content: "",
        rationale: "No-op preview operation.",
      }],
      expected_changed_files: [file.path],
      verification_command_ids: input.patch_policy.allowed_verification_command_ids,
      preconditions: [{ kind: "file_hash", path: file.path, expected_sha256: file.sha256, summary: "Preview file hash matches evidence." }],
      risk_level: "write",
      approval_required: false,
      confidence: 0.1,
      requires_scope_expansion: false,
    };
  };
}
