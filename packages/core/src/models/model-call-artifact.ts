import { z } from "zod";

export const ModelCallArtifactRole = z.enum(["planner", "implementer", "repair", "reviewer", "summarizer", "classifier"]);

export const ModelCallArtifactStatus = z.enum(["success", "failed", "yielded", "validation_failed", "provider_unavailable"]);

export const ModelCallSchemaValidationStatus = z.enum(["not_applicable", "passed", "failed"]);

export const ModelCallRedactionStatus = z.enum(["redacted", "no_sensitive_content_detected", "redaction_failed"]);

export const ModelCallArtifact = z.object({
  artifact_id: z.string().min(1),
  artifact_kind: z.literal("model_call"),
  call_id: z.string().min(1),
  route_id: z.string().min(1).optional(),
  role: ModelCallArtifactRole,
  provider: z.string().min(1),
  model: z.string().min(1),
  status: ModelCallArtifactStatus,
  plan_id: z.string().min(1).optional(),
  node_id: z.string().min(1).optional(),
  work_order_id: z.string().min(1).optional(),
  scenario_id: z.string().min(1).optional(),
  eval_run_id: z.string().min(1).optional(),
  input_artifact_refs: z.array(z.string().min(1)),
  output_artifact_refs: z.array(z.string().min(1)),
  redacted_prompt_artifact_id: z.string().min(1).optional(),
  redacted_response_artifact_id: z.string().min(1).optional(),
  output_schema_name: z.string().min(1).optional(),
  schema_validation_status: ModelCallSchemaValidationStatus,
  token_usage: z.object({
    input_tokens: z.number().int().min(0).optional(),
    output_tokens: z.number().int().min(0).optional(),
    total_tokens: z.number().int().min(0).optional(),
    cached_input_tokens: z.number().int().min(0).optional(),
    reasoning_tokens: z.number().int().min(0).optional(),
    estimated: z.boolean(),
  }).strict(),
  cost: z.object({
    estimated_cost_usd: z.number().min(0).optional(),
    provider_reported_cost_usd: z.number().min(0).optional(),
    estimated: z.boolean(),
  }).strict(),
  latency_ms: z.number().int().min(0).optional(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  error_code: z.string().min(1).optional(),
  error_message: z.string().min(1).optional(),
  redaction_status: ModelCallRedactionStatus,
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type ModelCallArtifactRole = z.infer<typeof ModelCallArtifactRole>;
export type ModelCallArtifactStatus = z.infer<typeof ModelCallArtifactStatus>;
export type ModelCallArtifact = z.infer<typeof ModelCallArtifact>;

export function artifactRoleForModelRole(role: string): ModelCallArtifactRole {
  if (role === "planner" || role === "implementer" || role === "repair" || role === "reviewer" || role === "summarizer" || role === "classifier") return role;
  return "repair";
}

