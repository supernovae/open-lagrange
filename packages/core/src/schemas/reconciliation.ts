import { z } from "zod";
import { DelegationContext } from "./delegation.js";
import {
  CognitiveArtifact,
  ExecutionIntent,
  Observation,
  OpenCotReconciliationResult,
  ReconciliationStatus,
  StructuredError,
} from "./open-cot.js";
import { CapabilitySnapshot, RiskLevel } from "./capabilities.js";

export const WorkflowStatus = z.enum([
  "accepted",
  "planning",
  "running",
  "completed",
  "completed_with_errors",
  "yielded",
  "requires_approval",
  "failed",
]);

export const ExecutionBounds = z.object({
  max_tasks_per_project: z.number().int().min(1),
  max_execution_intents_per_task: z.number().int().min(0),
  max_total_endpoint_attempts: z.number().int().min(0),
  max_critic_passes: z.literal(1),
  max_risk_without_approval: RiskLevel,
}).strict();

export const ScopedTask = z.object({
  task_id: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  allowed_scopes: z.array(z.string()),
  allowed_capabilities: z.array(z.string()),
  max_risk_level: RiskLevel,
}).strict();

export const ExecutionPlan = z.object({
  plan_id: z.string().min(1),
  schema_version: z.literal("open-cot.execution-plan.v1"),
  project_id: z.string().min(1),
  plan_version: z.string().min(1),
  goal: z.string().min(1),
  tasks: z.array(ScopedTask),
  assumptions: z.array(z.string()),
}).strict();

export const CriticResult = z.object({
  outcome: z.enum(["pass", "revise", "yield"]),
  summary: z.string(),
}).strict();

export const ApprovalRequest = z.object({
  approval_request_id: z.string().min(1),
  task_id: z.string().min(1),
  project_id: z.string().min(1),
  intent_id: z.string().min(1),
  requested_risk_level: RiskLevel,
  requested_capability: z.string().min(1),
  task_run_id: z.string().min(1),
  requested_at: z.string().datetime(),
  prompt: z.string(),
  trace_id: z.string().min(1),
}).strict();

export const ApprovalDecision = z.object({
  approval_request_id: z.string().min(1),
  task_id: z.string().min(1),
  project_id: z.string().min(1),
  intent_id: z.string().min(1),
  requested_risk_level: RiskLevel,
  requested_capability: z.string().min(1),
  requested_at: z.string().datetime(),
  decision: z.enum(["requested", "approved", "rejected"]),
  approved_by: z.string().min(1).optional(),
  rejected_by: z.string().min(1).optional(),
  decided_at: z.string().datetime().optional(),
  reason: z.string().optional(),
  trace_id: z.string().min(1),
}).strict();

export const TaskReconcilerInput = z.object({
  parent_project_id: z.string().min(1),
  parent_project_run_id: z.string().min(1),
  task_run_id: z.string().min(1),
  scoped_task: ScopedTask,
  delegation_context: DelegationContext,
  bounds: ExecutionBounds,
}).strict();

export const ApprovalContinuationInput = z.object({
  approval_request_id: z.string().min(1),
  task_run_id: z.string().min(1),
}).strict();

export const ApprovalContinuationEnvelope = z.object({
  kind: z.string().min(1),
  approval_request: ApprovalRequest,
  project_id: z.string().min(1),
  task_run_id: z.string().min(1),
  trace_id: z.string().min(1),
  payload: z.unknown(),
}).strict();

export const ApprovalContinuationContext = z.object({
  approval_request: ApprovalRequest,
  parent_project_id: z.string().min(1),
  parent_project_run_id: z.string().min(1),
  task_run_id: z.string().min(1),
  scoped_task: ScopedTask,
  delegation_context: DelegationContext,
  bounds: ExecutionBounds,
  capability_snapshot: CapabilitySnapshot,
  artifact: CognitiveArtifact,
  intent: ExecutionIntent,
}).strict();

export const ProjectReconcilerInput = z.object({
  goal: z.string().min(1),
  project_id: z.string().min(1).optional(),
  delegation_context: DelegationContext,
  metadata: z.record(z.string(), z.unknown()).optional(),
  bounds: ExecutionBounds.optional(),
}).strict();

export const TaskReconciliationResult = OpenCotReconciliationResult.extend({
  task_id: z.string().min(1),
  task_run_id: z.string().min(1),
  approval_request: ApprovalRequest.optional(),
}).strict();

export const ProjectReconciliationResult = z.object({
  project_id: z.string().min(1),
  project_run_id: z.string().min(1),
  status: ReconciliationStatus,
  plan: ExecutionPlan.optional(),
  task_run_ids: z.array(z.string()),
  task_results: z.array(TaskReconciliationResult),
  observations: z.array(Observation),
  errors: z.array(StructuredError),
  final_message: z.string(),
}).strict();

export const WorkflowStatusSnapshot = z.object({
  project_id: z.string().min(1),
  project_run_id: z.string().min(1),
  status: WorkflowStatus,
  task_run_ids: z.array(z.string()),
  observations: z.array(Observation),
  errors: z.array(StructuredError),
  final_message: z.string().optional(),
  updated_at: z.string().datetime(),
}).strict();

export type WorkflowStatus = z.infer<typeof WorkflowStatus>;
export type ExecutionBounds = z.infer<typeof ExecutionBounds>;
export type ScopedTask = z.infer<typeof ScopedTask>;
export type ExecutionPlan = z.infer<typeof ExecutionPlan>;
export type CriticResult = z.infer<typeof CriticResult>;
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
export type TaskReconcilerInput = z.infer<typeof TaskReconcilerInput>;
export type ApprovalContinuationInput = z.infer<typeof ApprovalContinuationInput>;
export type ApprovalContinuationEnvelope = z.infer<typeof ApprovalContinuationEnvelope>;
export type ApprovalContinuationContext = z.infer<typeof ApprovalContinuationContext>;
export type ProjectReconcilerInput = z.infer<typeof ProjectReconcilerInput>;
export type TaskReconciliationResult = z.infer<typeof TaskReconciliationResult>;
export type ProjectReconciliationResult = z.infer<typeof ProjectReconciliationResult>;
export type WorkflowStatusSnapshot = z.infer<typeof WorkflowStatusSnapshot>;

export const DEFAULT_EXECUTION_BOUNDS: ExecutionBounds = {
  max_tasks_per_project: 3,
  max_execution_intents_per_task: 2,
  max_total_endpoint_attempts: 2,
  max_critic_passes: 1,
  max_risk_without_approval: "read",
};

export type ValidatedArtifact = {
  readonly artifact: CognitiveArtifact;
  readonly execution_intents: readonly ExecutionIntent[];
  readonly capability_snapshot: CapabilitySnapshot;
};
