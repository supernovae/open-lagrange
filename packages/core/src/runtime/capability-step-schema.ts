import { z } from "zod";
import { DelegationContext } from "../schemas/delegation.js";
import { Observation, StructuredError } from "../schemas/open-cot.js";
import { RiskLevel } from "../schemas/capabilities.js";
import { ExecutionMode } from "./execution-mode.js";

export const CapabilityStepPolicyDecisionReport = z.object({
  decision: z.enum(["allow", "deny", "requires_approval", "yield"]),
  capability_ref: z.string().min(1),
  pack_id: z.string().min(1),
  risk_level: RiskLevel,
  side_effect_kind: z.string().min(1),
  delegation_context_summary: z.object({
    principal_id: z.string().min(1),
    delegate_id: z.string().min(1),
    max_risk_level: RiskLevel,
    allowed_capability_count: z.number().int().min(0),
    denied_scope_count: z.number().int().min(0),
  }).strict(),
  matched_rules: z.array(z.string()).readonly(),
  missing_scopes: z.array(z.string()).readonly(),
  required_approvals: z.array(z.string()).readonly(),
  reason: z.string(),
  created_at: z.string().datetime(),
}).strict();

export const CapabilityStepInput = z.object({
  step_id: z.string().min(1).optional(),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  capability_ref: z.string().min(1),
  capability_digest: z.string().regex(/^[a-f0-9]{64}$/),
  input: z.unknown(),
  delegation_context: DelegationContext,
  idempotency_key: z.string().min(1),
  input_artifact_refs: z.array(z.string().min(1)).default([]),
  execution_mode: ExecutionMode.optional(),
  dry_run: z.boolean().default(false),
  trace_id: z.string().min(1).optional(),
}).strict();

export const CapabilityStepStatus = z.enum(["success", "failed", "requires_approval", "yielded"]);

export const CapabilityStepResult = z.object({
  status: CapabilityStepStatus,
  output: z.unknown().optional(),
  output_artifact_refs: z.array(z.string().min(1)),
  execution_mode: ExecutionMode,
  policy_report: CapabilityStepPolicyDecisionReport.optional(),
  observations: z.array(Observation),
  structured_errors: z.array(StructuredError),
  duration_ms: z.number().int().min(0),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
}).strict();

export type CapabilityStepInput = z.infer<typeof CapabilityStepInput>;
export type CapabilityStepStatus = z.infer<typeof CapabilityStepStatus>;
export type CapabilityStepPolicyDecisionReport = z.infer<typeof CapabilityStepPolicyDecisionReport>;
export type CapabilityStepResult = z.infer<typeof CapabilityStepResult>;
