export type RepositoryModelRole = "planner_strong" | "implementer_small" | "repair_small" | "reviewer_medium" | "escalation_strong";

export interface ModelChoice {
  readonly role: RepositoryModelRole;
  readonly model: string;
}

export function chooseModelForRole(role: RepositoryModelRole): ModelChoice {
  const envKey = `OPEN_LAGRANGE_MODEL_${role.toUpperCase()}`;
  return {
    role,
    model: process.env[envKey] ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  };
}
