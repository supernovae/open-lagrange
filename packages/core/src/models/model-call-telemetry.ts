import { z } from "zod";

export const TokenUsage = z.object({
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  total_tokens: z.number().int().min(0),
  cached_input_tokens: z.number().int().min(0).optional(),
  reasoning_tokens: z.number().int().min(0).optional(),
}).strict();

export const ModelRoleLabel = z.enum(["planner", "implementer", "repair", "reviewer", "escalation"]);

export const ModelCallStatus = z.enum(["completed", "failed", "skipped", "fallback"]);

export const ModelCallTelemetry = z.object({
  call_id: z.string().min(1),
  role: ModelRoleLabel,
  provider: z.string().min(1),
  model: z.string().min(1),
  route_id: z.string().min(1).optional(),
  scenario_id: z.string().min(1).optional(),
  plan_id: z.string().min(1).optional(),
  node_id: z.string().min(1).optional(),
  usage: TokenUsage,
  latency_ms: z.number().int().min(0),
  estimated_cost_usd: z.number().min(0).optional(),
  provider_reported_cost_usd: z.number().min(0).optional(),
  request_id: z.string().min(1).optional(),
  status: ModelCallStatus,
  error: z.string().min(1).optional(),
  output_artifact_id: z.string().min(1).optional(),
}).strict();

export type TokenUsage = z.infer<typeof TokenUsage>;
export type ModelRoleLabel = z.infer<typeof ModelRoleLabel>;
export type ModelCallStatus = z.infer<typeof ModelCallStatus>;
export type ModelCallTelemetry = z.infer<typeof ModelCallTelemetry>;

