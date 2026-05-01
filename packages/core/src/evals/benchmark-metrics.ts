import { z } from "zod";

export const BenchmarkConfigurationId = z.enum([
  "deterministic-preview",
  "small-model-patch",
  "strong-model-patch",
  "small-repair-strong-escalation",
  "strong-plan-small-implement",
]);

export const BenchmarkMetrics = z.object({
  scenario_id: z.string().min(1),
  configuration_id: BenchmarkConfigurationId,
  success: z.boolean(),
  patch_validated: z.boolean(),
  verification_passed: z.boolean(),
  validation_failures_count: z.number().int().min(0),
  repair_attempts: z.number().int().min(0),
  scope_expansion_requests: z.number().int().min(0),
  approvals_required: z.number().int().min(0),
  tokens_input: z.number().int().min(0),
  tokens_output: z.number().int().min(0),
  estimated_cost: z.number().min(0),
  wall_clock_ms: z.number().int().min(0),
  capability_calls_count: z.number().int().min(0),
  repeated_action_count: z.number().int().min(0),
  changed_files_count: z.number().int().min(0),
  final_patch_size: z.number().int().min(0),
  review_report_quality_flags: z.array(z.string()),
}).strict();

export type BenchmarkConfigurationId = z.infer<typeof BenchmarkConfigurationId>;
export type BenchmarkMetrics = z.infer<typeof BenchmarkMetrics>;

export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}
