import type { Planfile } from "./planfile-schema.js";
import { derivePlanRequirements, type PlanPortabilityLevel, type RuntimeProfileForRequirements } from "./plan-requirements.js";

export interface AnalyzePlanPortabilityInput {
  readonly planfile: Planfile;
  readonly runtime_profile?: RuntimeProfileForRequirements;
}

export interface PlanPortabilityReport {
  readonly portability: PlanPortabilityLevel;
  readonly warnings: readonly string[];
}

export function analyzePlanPortability(input: AnalyzePlanPortabilityInput): PlanPortabilityReport {
  const requirements = derivePlanRequirements({
    planfile: input.planfile,
    ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}),
  });
  const warnings: string[] = [];
  if (requirements.portability_level === "machine_bound") warnings.push("Planfile contains machine-bound details such as absolute local paths.");
  if (requirements.portability_level === "profile_bound") warnings.push("Planfile depends on profile-specific providers or credentials.");
  if (requirements.portability_level === "workspace_bound") warnings.push("Planfile depends on the current workspace.");
  return { portability: requirements.portability_level, warnings };
}
