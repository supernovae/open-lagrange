import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { stableHash } from "../util/hash.js";

export const GoalFrame = z.object({
  goal_id: z.string().min(1),
  original_prompt: z.string().min(1),
  interpreted_goal: z.string().min(1),
  acceptance_criteria: z.array(z.string().min(1)),
  non_goals: z.array(z.string().min(1)),
  assumptions: z.array(z.string().min(1)),
  ambiguity: z.object({
    level: z.enum(["low", "medium", "high"]),
    questions: z.array(z.string().min(1)),
    blocking: z.boolean(),
  }).strict(),
  suggested_mode: z.enum(["dry_run", "apply_with_approval"]),
  risk_notes: z.array(z.string().min(1)),
  created_at: z.string().datetime(),
}).strict();

export type GoalFrame = z.infer<typeof GoalFrame>;

export interface GenerateGoalFrameInput {
  readonly original_prompt: string;
  readonly now?: string;
}

export async function generateGoalFrame(input: GenerateGoalFrameInput): Promise<GoalFrame> {
  const now = input.now ?? new Date().toISOString();
  if (!hasProviderKey()) return deterministicGoalFrame(input.original_prompt, now);
  const { object } = await generateObject({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    schema: GoalFrame,
    system: [
      "Emit a GoalFrame only.",
      "Do not execute tools or capabilities.",
      "Represent ambiguity explicitly.",
      "Keep acceptance criteria observable.",
    ].join("\n"),
    prompt: JSON.stringify({ ...input, now }),
  });
  return GoalFrame.parse(object);
}

export function deterministicGoalFrame(originalPrompt: string, now: string): GoalFrame {
  const normalized = originalPrompt.trim().replace(/\s+/g, " ");
  return GoalFrame.parse({
    goal_id: `goal_${stableHash({ normalized, now }).slice(0, 18)}`,
    original_prompt: normalized,
    interpreted_goal: normalized,
    acceptance_criteria: ["The requested work is represented as validated typed plan nodes."],
    non_goals: ["Execute plan nodes before approval."],
    assumptions: ["The prompt is sufficient for an initial dry-run Planfile."],
    ambiguity: { level: "medium", questions: [], blocking: false },
    suggested_mode: "dry_run",
    risk_notes: ["Write or external side-effect nodes require approval before execution."],
    created_at: now,
  });
}

function hasProviderKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY);
}
