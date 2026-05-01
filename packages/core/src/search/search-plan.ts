import { z } from "zod";
import { SearchProviderKind, SearchSourceType } from "./source-types.js";

export const SearchLimits = z.object({
  max_queries: z.number().int().min(1).max(5).default(1),
  max_results_per_query: z.number().int().min(1).max(25).default(5),
  max_sources_to_fetch: z.number().int().min(1).max(25).default(5),
  max_total_fetch_bytes: z.number().int().min(1_000).max(10_000_000).default(2_000_000),
  max_provider_calls: z.number().int().min(1).max(10).default(3),
  max_search_duration_ms: z.number().int().min(500).max(30_000).default(8_000),
}).strict();

export const SearchProviderPreference = z.object({
  provider_id: z.string().min(1).optional(),
  kind: SearchProviderKind.optional(),
}).strict().refine((value) => Boolean(value.provider_id || value.kind), {
  message: "Provider preference must include provider_id or kind.",
});

export const SearchStopConditions = z.object({
  min_results: z.number().int().min(1).max(25).default(3),
  stop_after_first_provider_with_results: z.boolean().default(true),
}).strict();

export const SearchPlan = z.object({
  search_plan_id: z.string().min(1),
  topic: z.string().min(1),
  objective: z.string().min(1),
  queries: z.array(z.string().min(1)).min(1).max(5),
  limits: SearchLimits.prefault({}),
  provider_preferences: z.array(SearchProviderPreference).default([]),
  domains_allowlist: z.array(z.string().min(1)).default([]),
  domains_denylist: z.array(z.string().min(1)).default([]),
  source_type_preferences: z.array(SearchSourceType).default([]),
  stop_conditions: SearchStopConditions.prefault({}),
}).strict().superRefine((plan, ctx) => {
  if (plan.queries.length > plan.limits.max_queries) {
    ctx.addIssue({
      code: "too_big",
      maximum: plan.limits.max_queries,
      origin: "array",
      inclusive: true,
      path: ["queries"],
      message: `SearchPlan has ${plan.queries.length} queries, above max_queries ${plan.limits.max_queries}.`,
    });
  }
});

export type SearchLimits = z.infer<typeof SearchLimits>;
export type SearchProviderPreference = z.infer<typeof SearchProviderPreference>;
export type SearchStopConditions = z.infer<typeof SearchStopConditions>;
export type SearchPlan = z.infer<typeof SearchPlan>;
