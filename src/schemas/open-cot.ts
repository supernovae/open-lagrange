import { z } from "zod";
import { CapabilitySnapshot, JsonSchemaLike, RiskLevel } from "./capabilities.js";

export const ReconciliationErrorCode = z.enum([
  "INVALID_ARTIFACT",
  "SNAPSHOT_MISMATCH",
  "UNKNOWN_ENDPOINT",
  "UNKNOWN_CAPABILITY",
  "CAPABILITY_DIGEST_MISMATCH",
  "SCHEMA_VALIDATION_FAILED",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "PRECONDITION_FAILED",
  "BUDGET_EXCEEDED",
  "ENDPOINT_EXECUTION_FAILED",
  "RESULT_VALIDATION_FAILED",
  "YIELDED",
]);

export const ReconciliationError = z.object({
  code: ReconciliationErrorCode,
  message: z.string(),
  intent_id: z.string().optional(),
  observed_at: z.string().datetime(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const IntentVerification = z.object({
  objective: z.string(),
  request_boundaries: z.array(z.string()),
  allowed_scope: z.array(z.string()),
  prohibited_scope: z.array(z.string()),
}).strict();

export const ReasoningTraceStep = z.object({
  step_id: z.string().min(1),
  kind: z.enum(["interpretation", "constraint", "hypothesis", "verification", "yield"]),
  content: z.string(),
  visibility: z.enum(["audit_summary", "detailed_evidence", "redacted"]),
  redaction_reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

export const ReasoningTrace = z.object({
  evidence_mode: z.enum(["audit_summary", "detailed_evidence", "redacted_evidence"]),
  summary: z.string(),
  steps: z.array(ReasoningTraceStep),
  contains_sensitive_content: z.boolean().optional(),
  redaction_reason: z.string().optional(),
}).strict();

export const ExecutionIntent = z.object({
  intent_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  endpoint_id: z.string().min(1),
  capability_name: z.string().min(1),
  capability_digest: z.string().regex(/^[a-f0-9]{64}$/),
  risk_level: RiskLevel,
  requires_approval: z.boolean(),
  idempotency_key: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  preconditions: z.array(z.string()).optional(),
  expected_result_shape: JsonSchemaLike.optional(),
  postconditions: z.array(z.string()).optional(),
}).strict();

export const Observation = z.object({
  observation_id: z.string().min(1),
  intent_id: z.string().optional(),
  status: z.enum(["recorded", "skipped", "error"]),
  summary: z.string(),
  output: z.unknown().optional(),
  observed_at: z.string().datetime(),
}).strict();

export const CognitiveArtifact = z.object({
  artifact_id: z.string().min(1),
  schema_version: z.literal("open-cot.core.v1"),
  capability_snapshot_id: z.string().min(1),
  intent_verification: IntentVerification,
  assumptions: z.array(z.string()),
  reasoning_trace: ReasoningTrace,
  execution_intents: z.array(ExecutionIntent),
  observations: z.array(Observation),
  uncertainty: z.object({
    level: z.enum(["low", "medium", "high"]),
    explanation: z.string(),
  }).strict(),
  yield_reason: z.string().optional(),
}).strict();

export const ReconciliationStatus = z.enum([
  "completed",
  "completed_with_errors",
  "yielded",
  "requires_approval",
  "failed",
]);

export const ReconciliationResult = z.object({
  reconciliation_id: z.string().min(1),
  status: ReconciliationStatus,
  capability_snapshot: CapabilitySnapshot,
  artifact: CognitiveArtifact.optional(),
  executed_intents: z.array(ExecutionIntent),
  skipped_intents: z.array(ExecutionIntent),
  observations: z.array(Observation),
  errors: z.array(ReconciliationError),
  final_message: z.string(),
});

export type ReconciliationErrorCode = z.infer<typeof ReconciliationErrorCode>;
export type ReconciliationError = z.infer<typeof ReconciliationError>;
export type IntentVerification = z.infer<typeof IntentVerification>;
export type ReasoningTraceStep = z.infer<typeof ReasoningTraceStep>;
export type ReasoningTrace = z.infer<typeof ReasoningTrace>;
export type ExecutionIntent = z.infer<typeof ExecutionIntent>;
export type Observation = z.infer<typeof Observation>;
export type CognitiveArtifact = z.infer<typeof CognitiveArtifact>;
export type ReconciliationStatus = z.infer<typeof ReconciliationStatus>;
export type ReconciliationResult = z.infer<typeof ReconciliationResult>;
