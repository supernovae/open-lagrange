import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { stableHash } from "../util/hash.js";
import type { GoalFrame } from "./goal-frame.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";

export interface GeneratePlanfileInput {
  readonly goal_frame: GoalFrame;
  readonly mode?: "dry_run" | "apply";
  readonly now?: string;
}

export interface RefinePlanfileInput {
  readonly planfile: PlanfileType;
  readonly feedback: string;
  readonly now?: string;
}

export async function generatePlanfile(input: GeneratePlanfileInput): Promise<PlanfileType> {
  const now = input.now ?? new Date().toISOString();
  if (!hasProviderKey()) return deterministicPlanfile(input.goal_frame, input.mode ?? "dry_run", now);
  const { object } = await generateObject({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    schema: Planfile,
    system: [
      "Emit a Planfile only.",
      "Do not execute tools or capabilities.",
      "Use typed nodes with explicit dependencies.",
      "Write and external side-effect nodes must require approval.",
    ].join("\n"),
    prompt: JSON.stringify({ ...input, now }),
  });
  return Planfile.parse(object);
}

export async function refinePlanfile(input: RefinePlanfileInput): Promise<PlanfileType> {
  const now = input.now ?? new Date().toISOString();
  if (!hasProviderKey()) {
    return Planfile.parse({
      ...input.planfile,
      goal_frame: {
        ...input.planfile.goal_frame,
        assumptions: [...input.planfile.goal_frame.assumptions, `Refinement feedback recorded: ${input.feedback}`],
      },
      updated_at: now,
    });
  }
  const { object } = await generateObject({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    schema: Planfile,
    system: [
      "Emit a refined Planfile only.",
      "Do not execute tools or capabilities.",
      "Preserve typed execution boundaries and approval requirements.",
    ].join("\n"),
    prompt: JSON.stringify({ ...input, now }),
  });
  return Planfile.parse(object);
}

export function deterministicPlanfile(goalFrame: GoalFrame, mode: "dry_run" | "apply", now: string): PlanfileType {
  const planId = `plan_${stableHash({ goal_id: goalFrame.goal_id, mode }).slice(0, 18)}`;
  return Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id: planId,
    goal_frame: goalFrame,
    mode,
    status: "draft",
    nodes: [
      node("frame_goal", "frame", "Frame goal", goalFrame.interpreted_goal, "Confirm goal, assumptions, non-goals, and acceptance criteria.", [], "read", false),
      node("inspect_context", "inspect", "Inspect context", "Collect bounded evidence needed to refine the plan.", "Use read-only capabilities selected by the execution environment.", ["frame_goal"], "read", false),
      node("design_steps", "design", "Design execution steps", "Turn evidence into executable typed nodes.", "Keep planning generic and pack-neutral.", ["inspect_context"], "read", false),
      node("review_plan", "review", "Review Planfile", "Check the plan against validation, policy, and acceptance criteria.", "Produce a review report before execution.", ["design_steps"], "read", false),
      node("finalize_report", "finalize", "Finalize report", "Summarize status, artifacts, and remaining work.", "Produce the final report projection.", ["review_plan"], "read", false),
    ],
    edges: [
      { from: "frame_goal", to: "inspect_context", reason: "goal before evidence" },
      { from: "inspect_context", to: "design_steps", reason: "evidence before design" },
      { from: "design_steps", to: "review_plan", reason: "design before review" },
      { from: "review_plan", to: "finalize_report", reason: "review before final report" },
    ],
    approval_policy: {
      require_approval_for_risks: ["write", "destructive", "external_side_effect"],
    },
    verification_policy: {
      allowed_command_ids: [],
    },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  });
}

function node(
  id: string,
  kind: PlanfileType["nodes"][number]["kind"],
  title: string,
  objective: string,
  description: string,
  depends_on: readonly string[],
  risk_level: PlanfileType["nodes"][number]["risk_level"],
  approval_required: boolean,
): PlanfileType["nodes"][number] {
  return {
    id,
    kind,
    title,
    objective,
    description,
    depends_on: [...depends_on],
    allowed_capability_refs: [],
    expected_outputs: [`${title} artifact`],
    acceptance_refs: ["acceptance:1"],
    risk_level,
    approval_required,
    status: "pending",
    artifacts: [],
    errors: [],
  };
}

function hasProviderKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY);
}
