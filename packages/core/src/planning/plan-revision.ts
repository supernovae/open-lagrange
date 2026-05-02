import { z } from "zod";
import type { ModelRouteConfig } from "../evals/model-route-config.js";
import { executeModelRoleCall, ModelRoleCallError, type ModelRoleTraceContext } from "../models/model-route-executor.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";

export const PlanRevision = z.object({
  revision_id: z.string().min(1),
  source: z.enum(["deterministic", "model"]),
  reason: z.string().min(1),
  changes: z.array(z.string().min(1)),
  planfile: Planfile,
  validation_ok: z.boolean(),
  created_at: z.string().datetime(),
  telemetry_artifact_id: z.string().min(1).optional(),
}).strict();

export type PlanRevision = z.infer<typeof PlanRevision>;

export const ModelPlanRevisionOutput = z.object({
  reason: z.string().min(1),
  changes: z.array(z.string().min(1)),
  planfile: Planfile,
}).strict();

export async function revisePlanfileWithModel(input: {
  readonly planfile: PlanfileType;
  readonly reason: string;
  readonly route: ModelRouteConfig;
  readonly trace_context?: ModelRoleTraceContext;
  readonly now?: string;
}): Promise<PlanRevision> {
  const now = input.now ?? new Date().toISOString();
  try {
    const result = await executeModelRoleCall({
      role: "planner",
      model_ref: input.route.roles.planner,
      schema: ModelPlanRevisionOutput,
      system: [
        "Emit a schema-bound PlanRevision payload only.",
        "Do not execute capabilities.",
        "Do not invent capability references.",
        "Preserve policy, approval, and validation constraints.",
      ].join("\n"),
      prompt: JSON.stringify({ reason: input.reason, planfile: input.planfile }, null, 2),
      trace_context: {
        ...input.trace_context,
        route_id: input.route.route_id,
        plan_id: input.planfile.plan_id,
        output_schema_name: "PlanRevision",
      },
      persist_telemetry: true,
    });
    const planfile = withCanonicalPlanDigest(Planfile.parse(result.object.planfile));
    const validation = validatePlanfile(planfile);
    return PlanRevision.parse({
      revision_id: `revision_${planfile.canonical_plan_digest?.slice(0, 18) ?? input.planfile.plan_id}`,
      source: "model",
      reason: result.object.reason,
      changes: result.object.changes,
      planfile,
      validation_ok: validation.ok,
      created_at: now,
      ...(result.telemetry_artifact_id ? { telemetry_artifact_id: result.telemetry_artifact_id } : {}),
    });
  } catch (caught) {
    if (caught instanceof ModelRoleCallError) throw caught;
    throw new ModelRoleCallError("MODEL_ROLE_CALL_FAILED", caught instanceof Error ? caught.message : String(caught));
  }
}
