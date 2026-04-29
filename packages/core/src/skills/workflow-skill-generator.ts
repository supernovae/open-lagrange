import YAML from "yaml";
import { stableHash } from "../util/hash.js";
import { Planfile, type Planfile as PlanfileType } from "../planning/planfile-schema.js";
import { renderPlanfileMarkdown } from "../planning/planfile-markdown.js";
import { withCanonicalPlanDigest } from "../planning/planfile-validator.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { redactSecretRef } from "../secrets/secret-redaction.js";
import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import type { SkillFrame } from "./skill-frame.js";
import { matchCapabilitiesForSkill } from "./capability-match.js";
import { decideSkillBuild, type SkillBuildDecision } from "./skill-build-decision.js";
import { WorkflowSkill, type WorkflowSkill as WorkflowSkillType } from "./workflow-skill.js";
import { validateWorkflowSkill } from "./skill-validator.js";

export interface GenerateWorkflowSkillInput {
  readonly frame: SkillFrame;
  readonly capability_snapshot?: CapabilitySnapshot;
  readonly now?: string;
}

export interface WorkflowSkillGenerationResult {
  readonly frame: SkillFrame;
  readonly decision: SkillBuildDecision;
  readonly workflow_skill?: WorkflowSkillType;
  readonly markdown: string;
}

export function generateWorkflowSkill(input: GenerateWorkflowSkillInput): WorkflowSkillGenerationResult {
  const now = input.now ?? new Date().toISOString();
  const capability_snapshot = input.capability_snapshot ?? createCapabilitySnapshotForTask({
    max_risk_level: input.frame.risk_level,
    now,
  });
  const capability_matches = matchCapabilitiesForSkill({ frame: input.frame, capability_snapshot });
  const decision = decideSkillBuild({ frame: input.frame, capability_matches });
  const workflow_skill = decision.decision === "workflow_skill"
    ? WorkflowSkill.parse({
      schema_version: "open-lagrange.workflow-skill.v1",
      skill_id: input.frame.skill_id,
      name: titleFrom(input.frame.interpreted_goal),
      description: input.frame.interpreted_goal,
      required_packs: [...new Set(capability_matches.matches.map((match) => match.pack_id))],
      required_capabilities: capability_matches.matches.map((match) => match.capability_ref),
      required_scopes: input.frame.required_scopes,
      required_secret_refs: input.frame.required_secrets_as_refs,
      planfile_template: planfileTemplate(input.frame, capability_matches.matches.map((match) => match.capability_ref), now),
      approval_policy: {
        risk_level: input.frame.risk_level,
        approval_required: input.frame.risk_level !== "read" || input.frame.approval_requirements.length > 0,
        requirements: input.frame.approval_requirements,
      },
      examples: input.frame.triggers.length > 0
        ? input.frame.triggers.map((trigger) => ({ title: `Run ${titleFrom(input.frame.interpreted_goal)}`, input: trigger, expected_output: input.frame.expected_outputs[0] ?? "Workflow result artifact" }))
        : [{ title: `Run ${titleFrom(input.frame.interpreted_goal)}`, input: input.frame.required_inputs[0] ?? input.frame.interpreted_goal, expected_output: input.frame.expected_outputs[0] ?? "Workflow result artifact" }],
      created_at: now,
    })
    : undefined;
  if (workflow_skill) {
    const validation = validateWorkflowSkill(workflow_skill, { capability_snapshot });
    if (!validation.ok) throw new Error(validation.errors.join("; "));
  }
  return {
    frame: input.frame,
    decision,
    ...(workflow_skill ? { workflow_skill } : {}),
    markdown: renderWorkflowSkillMarkdown({ frame: input.frame, decision, ...(workflow_skill ? { workflow_skill } : {}) }),
  };
}

export function renderWorkflowSkillMarkdown(input: {
  readonly frame: SkillFrame;
  readonly decision: SkillBuildDecision;
  readonly workflow_skill?: WorkflowSkillType;
}): string {
  const redactedSecrets = input.frame.required_secrets_as_refs.map((ref) => redactSecretRef(ref, false));
  const block = input.workflow_skill
    ? YAML.stringify(input.workflow_skill).trimEnd()
    : YAML.stringify({ skill_id: input.frame.skill_id, decision: input.decision.decision, missing_capabilities: input.decision.missing_capabilities, safety_concerns: input.decision.safety_concerns }).trimEnd();
  return [
    `# Workflow Skill: ${titleFrom(input.frame.interpreted_goal)}`,
    "",
    "## Interpreted Goal",
    input.frame.interpreted_goal,
    "",
    "## Assumptions",
    list(input.frame.ambiguity.assumptions),
    "",
    "## Missing Details",
    list(input.frame.ambiguity.questions),
    "",
    "## Existing Pack Matches",
    list(input.decision.capability_matches.matches.map((match) => `${match.capability_ref} (${Math.round(match.score * 100)}%)`)),
    "",
    "## Missing Capabilities",
    list(input.decision.missing_capabilities),
    "",
    "## Required Scopes",
    list(input.frame.required_scopes),
    "",
    "## Required Secret Refs",
    list(redactedSecrets.map((ref) => `${ref.ref_id}: ${ref.redacted}`)),
    "",
    "## Approval Requirements",
    list(input.frame.approval_requirements),
    "",
    "## Generated Workflow Plan",
    input.workflow_skill ? renderPlanfileMarkdown(input.workflow_skill.planfile_template) : "No workflow Planfile was generated.",
    "",
    "## Executable WorkflowSkill",
    "```yaml workflow_skill",
    block,
    "```",
    "",
  ].join("\n");
}

export function previewWorkflowSkillRun(input: {
  readonly workflow_skill: WorkflowSkillType;
  readonly capability_snapshot?: CapabilitySnapshot;
}): {
  readonly skill_id: string;
  readonly status: "dry_run";
  readonly capability_validation: ReturnType<typeof validateWorkflowSkill>;
  readonly required_capabilities: readonly string[];
  readonly required_scopes: readonly string[];
  readonly required_secret_refs: readonly ReturnType<typeof redactSecretRef>[];
  readonly approval_requirements: readonly string[];
  readonly planfile_markdown: string;
} {
  const capability_validation = validateWorkflowSkill(input.workflow_skill, input.capability_snapshot ? { capability_snapshot: input.capability_snapshot } : {});
  return {
    skill_id: input.workflow_skill.skill_id,
    status: "dry_run",
    capability_validation,
    required_capabilities: input.workflow_skill.required_capabilities,
    required_scopes: input.workflow_skill.required_scopes,
    required_secret_refs: input.workflow_skill.required_secret_refs.map((ref) => redactSecretRef(ref, false)),
    approval_requirements: input.workflow_skill.approval_policy.requirements,
    planfile_markdown: renderPlanfileMarkdown(input.workflow_skill.planfile_template),
  };
}

function planfileTemplate(frame: SkillFrame, capabilityRefs: readonly string[], now: string): PlanfileType {
  const risk = frame.risk_level;
  return withCanonicalPlanDigest(Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id: `plan_${stableHash({ skill_id: frame.skill_id, goal: frame.interpreted_goal }).slice(0, 18)}`,
    goal_frame: {
      goal_id: `goal_${stableHash(frame.skill_id).slice(0, 18)}`,
      original_prompt: frame.original_markdown,
      interpreted_goal: frame.interpreted_goal,
      acceptance_criteria: frame.expected_outputs.length > 0 ? frame.expected_outputs : ["Workflow output is produced."],
      non_goals: ["Generate new capability pack code in Phase 1.", "Execute freeform markdown."],
      assumptions: frame.ambiguity.assumptions,
      ambiguity: {
        level: frame.ambiguity.level,
        questions: frame.ambiguity.questions,
        blocking: frame.ambiguity.blocking,
      },
      suggested_mode: "dry_run",
      risk_notes: frame.safety_concerns,
      created_at: now,
    },
    mode: "dry_run",
    status: "draft",
    nodes: [
      node("frame_skill", "frame", "Frame skill", frame.interpreted_goal, [], [], "read", false),
      node("inspect_capabilities", "inspect", "Inspect capabilities", "Match required workflow behavior to existing capability packs.", ["frame_skill"], capabilityRefs, "read", false),
      node("design_workflow", "design", "Design workflow Planfile", "Create a Planfile-backed workflow without generating executable scripts.", ["inspect_capabilities"], capabilityRefs, "read", false),
      node("review_workflow", "review", "Review workflow skill", "Validate scopes, secret refs, approvals, and capability matches.", ["design_workflow"], capabilityRefs, "read", false),
      node("finalize_skill", "finalize", "Finalize workflow skill", "Produce the WorkflowSkill artifact and dry-run preview.", ["review_workflow"], capabilityRefs, risk, risk !== "read"),
    ],
    edges: [
      { from: "frame_skill", to: "inspect_capabilities", reason: "skill frame before capability matching" },
      { from: "inspect_capabilities", to: "design_workflow", reason: "matches before workflow design" },
      { from: "design_workflow", to: "review_workflow", reason: "workflow before review" },
      { from: "review_workflow", to: "finalize_skill", reason: "review before final artifact" },
    ],
    approval_policy: {
      require_approval_for_risks: ["write", "destructive", "external_side_effect"],
    },
    verification_policy: { allowed_command_ids: [] },
    execution_context: { skill: { skill_id: frame.skill_id } },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  }));
}

function node(
  id: string,
  kind: PlanfileType["nodes"][number]["kind"],
  title: string,
  objective: string,
  depends_on: readonly string[],
  allowed_capability_refs: readonly string[],
  risk_level: PlanfileType["nodes"][number]["risk_level"],
  approval_required: boolean,
): PlanfileType["nodes"][number] {
  return {
    id,
    kind,
    title,
    objective,
    description: objective,
    depends_on: [...depends_on],
    allowed_capability_refs: [...allowed_capability_refs],
    expected_outputs: [`${title} artifact`],
    acceptance_refs: ["acceptance:1"],
    risk_level,
    approval_required,
    status: "pending",
    artifacts: [],
    errors: [],
  };
}

function titleFrom(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 80) || "Workflow Skill";
}

function list(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.";
}
