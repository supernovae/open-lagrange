import { z } from "zod";

export const ModelRef = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  role_label: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_output_tokens: z.number().int().min(1).optional(),
}).strict();

export const ModelRouteConfig = z.object({
  route_id: z.string().min(1),
  label: z.string().min(1),
  roles: z.object({
    planner: ModelRef,
    implementer: ModelRef,
    repair: ModelRef,
    reviewer: ModelRef,
    escalation: ModelRef.optional(),
  }).strict(),
  max_repair_attempts: z.number().int().min(0),
  escalation_policy: z.object({
    enabled: z.boolean(),
    escalate_after_repeated_failure_count: z.number().int().min(0),
    escalate_after_validation_failures: z.number().int().min(0),
  }).strict(),
  authoritative_apply: z.boolean(),
}).strict();

export type ModelRef = z.infer<typeof ModelRef>;
export type ModelRouteConfig = z.infer<typeof ModelRouteConfig>;

export function listModelRouteConfigs(): readonly ModelRouteConfig[] {
  const provider = process.env.OPEN_LAGRANGE_MODEL_PROVIDER ?? "openai";
  const small = process.env.OPEN_LAGRANGE_MODEL_CODER ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const strong = process.env.OPEN_LAGRANGE_MODEL_HIGH ?? process.env.OPENAI_MODEL ?? "gpt-4o";
  const reviewer = process.env.OPEN_LAGRANGE_MODEL ?? small;
  return [
    route("strong-all", "Strong model for all roles", provider, strong, strong, strong, strong, true),
    route("small-all", "Small model for all roles", provider, small, small, small, small, true),
    route("strong-plan-small-implement", "Strong planning and review, small implementation", provider, strong, small, small, strong, true, strong),
    route("small-implement-strong-repair", "Small implementation with strong repair", provider, strong, small, strong, reviewer, true, strong),
    route("deterministic-preview", "Deterministic preview baseline", provider, small, small, small, reviewer, false),
  ];
}

export function findModelRouteConfig(routeId: string): ModelRouteConfig | undefined {
  return listModelRouteConfigs().find((route) => route.route_id === routeId);
}

function route(
  route_id: string,
  label: string,
  provider: string,
  planner: string,
  implementer: string,
  repair: string,
  reviewer: string,
  authoritative_apply: boolean,
  escalation?: string,
): ModelRouteConfig {
  return ModelRouteConfig.parse({
    route_id,
    label,
    roles: {
      planner: ref(provider, planner, "planner"),
      implementer: ref(provider, implementer, "implementer"),
      repair: ref(provider, repair, "repair"),
      reviewer: ref(provider, reviewer, "reviewer"),
      ...(escalation ? { escalation: ref(provider, escalation, "escalation") } : {}),
    },
    max_repair_attempts: 3,
    escalation_policy: {
      enabled: Boolean(escalation),
      escalate_after_repeated_failure_count: 2,
      escalate_after_validation_failures: 2,
    },
    authoritative_apply,
  });
}

function ref(provider: string, model: string, role_label: string): ModelRef {
  return { provider, model, role_label };
}
