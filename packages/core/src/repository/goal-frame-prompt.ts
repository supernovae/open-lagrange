import type { RepositoryMetadataSummary } from "./model-goal-frame-generator.js";

export function goalFrameSystemPrompt(): string {
  return [
    "Emit a GoalFrame JSON object only.",
    "You cannot inspect the repository directly.",
    "Use only the repository metadata provided in the prompt.",
    "Do not invent files, symbols, APIs, or test results.",
    "Preserve user constraints.",
    "Keep scope small.",
    "Separate assumptions from facts.",
  ].join("\n");
}

export function buildGoalFramePrompt(input: {
  readonly scenario_id?: string;
  readonly repo_root: string;
  readonly original_goal: string;
  readonly repo_metadata: RepositoryMetadataSummary;
  readonly user_constraints?: readonly string[];
  readonly mode: "repo_plan" | "eval";
  readonly now: string;
}): string {
  return JSON.stringify({
    scenario_id: input.scenario_id,
    repo_root: redactPath(input.repo_root),
    original_goal: input.original_goal,
    repo_metadata: input.repo_metadata,
    user_constraints: input.user_constraints ?? [],
    mode: input.mode,
    now: input.now,
    required_fields: [
      "goal_id",
      "original_prompt",
      "interpreted_goal",
      "acceptance_criteria",
      "non_goals",
      "assumptions",
      "ambiguity",
      "suggested_mode",
      "risk_notes",
      "created_at",
    ],
  });
}

function redactPath(value: string): string {
  return value.replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]");
}

