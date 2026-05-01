import { z } from "zod";
import { ModelUsageSummary } from "./provider-usage.js";

export const ScenarioRunStatus = z.enum(["passed", "failed", "yielded", "skipped", "errored"]);

export const ScenarioRunMetrics = z.object({
  run_id: z.string().min(1),
  scenario_id: z.string().min(1),
  route_id: z.string().min(1),
  status: ScenarioRunStatus,
  patch_validated: z.boolean(),
  patch_applied: z.boolean(),
  final_patch_applies_to_base: z.boolean(),
  verification_passed: z.boolean(),
  success_criteria_passed: z.boolean(),
  validation_failures_count: z.number().int().min(0),
  verification_failures_count: z.number().int().min(0),
  repair_attempts: z.number().int().min(0),
  scope_expansion_requests: z.number().int().min(0),
  approvals_required: z.number().int().min(0),
  changed_files: z.array(z.string()),
  forbidden_files_changed: z.array(z.string()),
  final_patch_size_bytes: z.number().int().min(0),
  capability_calls_count: z.number().int().min(0),
  repeated_action_count: z.number().int().min(0),
  wall_clock_ms: z.number().int().min(0),
  model_usage: ModelUsageSummary,
  artifact_refs: z.array(z.string()),
  error_codes: z.array(z.string()),
}).strict();

export type ScenarioRunStatus = z.infer<typeof ScenarioRunStatus>;
export type ScenarioRunMetrics = z.infer<typeof ScenarioRunMetrics>;
