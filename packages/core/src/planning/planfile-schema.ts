import { z } from "zod";
import { RiskLevel } from "../schemas/capabilities.js";
import { ExecutionMode } from "../runtime/execution-mode.js";
import { GoalFrame } from "./goal-frame.js";
import { PlanArtifactRef } from "./plan-artifacts.js";

export const PLANFILE_SCHEMA_VERSION = "open-lagrange.plan.v1" as const;

export const PlanMode = z.enum(["dry_run", "apply"]);
export const PlanStatus = z.enum(["draft", "validated", "ready", "approved", "pending", "running", "completed", "failed", "yielded"]);
export const PlanNodeKind = z.enum([
  "frame",
  "inspect",
  "analyze",
  "design",
  "patch",
  "verify",
  "repair",
  "review",
  "approval",
  "finalize",
]);
export const PlanNodeStatus = z.enum(["pending", "ready", "running", "completed", "failed", "yielded", "skipped"]);

export const PlanNode = z.object({
  id: z.string().min(1),
  kind: PlanNodeKind,
  title: z.string().min(1),
  objective: z.string().min(1),
  description: z.string(),
  depends_on: z.array(z.string().min(1)),
  allowed_capability_refs: z.array(z.string().min(1)),
  execution_mode: ExecutionMode.optional(),
  expected_outputs: z.array(z.string().min(1)),
  acceptance_refs: z.array(z.string().min(1)),
  risk_level: RiskLevel,
  approval_required: z.boolean(),
  status: PlanNodeStatus,
  artifacts: z.array(PlanArtifactRef),
  errors: z.array(z.string()),
  optional: z.boolean().optional(),
  verification_command_ids: z.array(z.string().min(1)).optional(),
}).strict();

export const PlanEdge = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string(),
}).strict();

export const ApprovalPolicy = z.object({
  require_approval_for_risks: z.array(RiskLevel),
  approved_plan_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  explicit_destructive_goal: z.boolean().optional(),
}).strict();

export const VerificationPolicy = z.object({
  allowed_command_ids: z.array(z.string().min(1)),
}).strict();

export const PlanfileLifecycle = z.object({
  builder_session_id: z.string().min(1).optional(),
  questions_answered: z.number().int().min(0).optional(),
  assumptions: z.array(z.string().min(1)).optional(),
  validation_status: z.enum(["unknown", "passed", "failed"]).optional(),
  simulation_status: z.enum(["unknown", "ready", "needs_input", "missing_requirements", "invalid", "unsafe"]).optional(),
}).strict();

export const Planfile = z.object({
  schema_version: z.literal(PLANFILE_SCHEMA_VERSION),
  plan_id: z.string().min(1),
  goal_frame: GoalFrame,
  mode: PlanMode,
  status: PlanStatus,
  nodes: z.array(PlanNode),
  edges: z.array(PlanEdge),
  approval_policy: ApprovalPolicy,
  verification_policy: VerificationPolicy,
  execution_context: z.record(z.string(), z.unknown()).optional(),
  lifecycle: PlanfileLifecycle.optional(),
  artifact_refs: z.array(PlanArtifactRef),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  canonical_plan_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export type PlanMode = z.infer<typeof PlanMode>;
export type PlanStatus = z.infer<typeof PlanStatus>;
export type PlanNodeKind = z.infer<typeof PlanNodeKind>;
export type PlanNodeStatus = z.infer<typeof PlanNodeStatus>;
export type PlanNode = z.infer<typeof PlanNode>;
export type PlanEdge = z.infer<typeof PlanEdge>;
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;
export type VerificationPolicy = z.infer<typeof VerificationPolicy>;
export type PlanfileLifecycle = z.infer<typeof PlanfileLifecycle>;
export type Planfile = z.infer<typeof Planfile>;
