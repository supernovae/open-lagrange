import { Planfile, type Planfile as PlanfileType } from "../planning/planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "../planning/planfile-validator.js";
import { executeModelRoleCall, ModelRoleCallError } from "../models/model-route-executor.js";
import type { GoalFrame } from "../planning/goal-frame.js";
import type { ModelRouteConfig } from "../evals/model-route-config.js";
import type { ModelUsageRecord } from "../evals/provider-usage.js";
import type { RepositoryMetadataSummary } from "./model-goal-frame-generator.js";
import { buildPlanfileGenerationPrompt, planfileGenerationSystemPrompt, type CapabilitySnapshotForPlanning, type PlanningPolicy } from "./planfile-generation-prompt.js";
import { ModelPlanfileOutput } from "./planfile-output-schema.js";
import type { VerificationPolicy } from "./verification-policy.js";

export async function generateModelRepositoryPlanfile(input: {
  readonly goal_frame: GoalFrame;
  readonly repo_metadata: RepositoryMetadataSummary;
  readonly available_capabilities: CapabilitySnapshotForPlanning;
  readonly verification_policy: VerificationPolicy;
  readonly planning_policy: PlanningPolicy;
  readonly route: ModelRouteConfig;
  readonly plan_id: string;
  readonly repo_root: string;
  readonly scenario_id?: string;
  readonly telemetry_records?: ModelUsageRecord[];
  readonly now: string;
}): Promise<PlanfileType> {
  const prompt = buildPlanfileGenerationPrompt(input);
  const result = await executeModelRoleCall({
    role: "planner",
    model_ref: input.route.roles.planner,
    schema: ModelPlanfileOutput,
    system: planfileGenerationSystemPrompt(),
    prompt,
    trace_context: {
      route_id: input.route.route_id,
      ...(input.scenario_id ? { scenario_id: input.scenario_id } : {}),
      plan_id: input.plan_id,
    },
  });
  input.telemetry_records?.push(result.usage_record);
  const planfile = withCanonicalPlanDigest(Planfile.parse({
    ...result.object,
    plan_id: input.plan_id,
    goal_frame: input.goal_frame,
    execution_context: {
      ...(result.object.execution_context ?? {}),
      repository: {
        repo_root: input.repo_root,
        verification_command_ids: input.verification_policy.allowed_commands.map((command) => command.command_id),
      },
    },
    updated_at: input.now,
  }));
  const validation = validatePlanfile(planfile);
  if (!validation.ok) {
    throw new ModelRoleCallError("MODEL_ROLE_CALL_FAILED", `INVALID_PLANFILE_GENERATION: ${validation.issues.map((issue) => issue.message).join("; ")}`);
  }
  return planfile;
}

