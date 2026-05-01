import { performance } from "node:perf_hooks";
import { generateObject } from "ai";
import { createConfiguredLanguageModel } from "../model-providers/index.js";
import { buildPatchPlanPrompt, patchPlanSystemPrompt } from "../repository/patch-plan-prompt.js";
import { ModelPatchPlanOutput, normalizeModelPatchPlanOutput } from "../repository/patch-plan-output-schema.js";
import type { GeneratePatchPlanFromEvidenceInput, PatchPlanGenerator } from "../repository/model-patch-plan-generator.js";
import { PatchPlanGenerationError, modelProviderUnavailable } from "../repository/patch-plan-generation-errors.js";
import type { RepositoryPatchPlan } from "../repository/patch-plan.js";
import type { ModelRouteConfig, ModelRef } from "./model-route-config.js";
import { usageRecordFromProvider, type ModelUsageRecord } from "./provider-usage.js";

export interface LiveProviderPatchPlanGenerator {
  readonly generator: PatchPlanGenerator;
  readonly usage_records: readonly ModelUsageRecord[];
}

export function createLiveProviderPatchPlanGenerator(route: ModelRouteConfig): LiveProviderPatchPlanGenerator {
  const usageRecords: ModelUsageRecord[] = [];
  const generator: PatchPlanGenerator = async (input) => {
    const modelRef = modelRefForPatchPlan(route, input);
    const model = createConfiguredLanguageModel("default", {
      provider: modelRef.provider,
      models: { default: modelRef.model },
    });
    if (!model) throw modelProviderUnavailable();
    const prompt = buildPatchPlanPrompt(input);
    const started = performance.now();
    try {
      const result = await generateObject({
        model,
        schema: ModelPatchPlanOutput,
        system: patchPlanSystemPrompt(),
        prompt,
        ...(modelRef.temperature === undefined ? {} : { temperature: modelRef.temperature }),
        ...(modelRef.top_p === undefined ? {} : { topP: modelRef.top_p }),
        ...(modelRef.max_output_tokens === undefined ? {} : { maxOutputTokens: modelRef.max_output_tokens }),
      });
      const latency = Math.max(0, Math.round(performance.now() - started));
      const patchPlan = normalizeModelPatchPlanOutput(result.object);
      usageRecords.push(usageRecordFromProvider({
        model_ref: modelRef,
        prompt,
        output: result.object,
        provider_result: result,
        latency_ms: latency,
      }));
      return patchPlan;
    } catch (caught) {
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

export function hasLiveProviderForRoute(route: ModelRouteConfig): boolean {
  if (!route.authoritative_apply) return true;
  return [route.roles.implementer, route.roles.repair, route.roles.escalation].filter(Boolean).every((ref) =>
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
