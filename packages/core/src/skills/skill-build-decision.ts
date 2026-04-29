import { z } from "zod";
import { RecommendedSkillArtifactType, SkillFrame } from "./skill-frame.js";
import { CapabilityMatchResult } from "./capability-match.js";

export const SkillBuildDecision = z.object({
  skill_id: z.string().min(1),
  decision: RecommendedSkillArtifactType,
  summary: z.string(),
  capability_matches: CapabilityMatchResult,
  missing_capabilities: z.array(z.string()),
  safety_concerns: z.array(z.string()),
  approval_requirements: z.array(z.string()),
}).strict();

export type SkillBuildDecision = z.infer<typeof SkillBuildDecision>;

export function decideSkillBuild(input: {
  readonly frame: SkillFrame;
  readonly capability_matches: CapabilityMatchResult;
}): SkillBuildDecision {
  const missing = [...new Set([...input.frame.missing_capabilities, ...input.capability_matches.missing_capabilities])];
  const unsafe = input.frame.safety_concerns;
  const decision = unsafe.length > 0
    ? "unsupported"
    : missing.length > 0
      ? "capability_pack_required"
      : input.frame.recommended_artifact_type === "prompt_template"
        ? "prompt_template"
        : "workflow_skill";
  return SkillBuildDecision.parse({
    skill_id: input.frame.skill_id,
    decision,
    summary: summaryFor(decision, missing, unsafe),
    capability_matches: input.capability_matches,
    missing_capabilities: missing,
    safety_concerns: unsafe,
    approval_requirements: input.frame.approval_requirements,
  });
}

function summaryFor(decision: SkillBuildDecision["decision"], missing: readonly string[], unsafe: readonly string[]): string {
  if (decision === "unsupported") return `Unsupported: ${unsafe.join("; ")}`;
  if (decision === "capability_pack_required") return `Missing capabilities: ${missing.join("; ")}`;
  if (decision === "prompt_template") return "Prompt template recommended; executable workflow is not required.";
  return "Existing capability packs can satisfy this workflow skill.";
}
