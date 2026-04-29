export type RepositoryModelRole = "planner_strong" | "implementer_small" | "repair_small" | "reviewer_medium" | "escalation_strong";

export interface ModelChoice {
  readonly role: RepositoryModelRole;
  readonly model: string;
}

export function chooseModelForRole(role: RepositoryModelRole): ModelChoice {
  const envKey = `OPEN_LAGRANGE_MODEL_${role.toUpperCase()}`;
  const slot = role === "planner_strong" || role === "escalation_strong"
    ? process.env.OPEN_LAGRANGE_MODEL_HIGH
    : role === "implementer_small" || role === "repair_small"
      ? process.env.OPEN_LAGRANGE_MODEL_CODER
      : process.env.OPEN_LAGRANGE_MODEL;
  return {
    role,
    model: process.env[envKey] ?? slot ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  };
}
