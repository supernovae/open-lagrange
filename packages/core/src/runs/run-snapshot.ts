import { z } from "zod";
import { ArtifactKind } from "../artifacts/artifact-model.js";
import { StructuredError } from "../schemas/open-cot.js";
import { CapabilityStepPolicyDecisionReport } from "../runtime/capability-step-schema.js";
import { NodeAttemptSummary } from "./node-attempt.js";
import { DurableRunStatus } from "./run.js";
import { RunEvent } from "./run-event.js";
import { NextAction as NextActionSchema } from "./run-next-action.js";

export const RunNodeStatus = z.enum(["pending", "ready", "running", "requires_approval", "yielded", "failed", "completed", "skipped"]);

export const RunNodeSnapshot = z.object({
  node_id: z.string().min(1),
  title: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  status: RunNodeStatus,
  current_attempt_id: z.string().min(1).optional(),
  attempts: z.array(NodeAttemptSummary),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  capability_refs: z.array(z.string().min(1)),
  artifact_refs: z.array(z.string().min(1)),
  error_refs: z.array(z.string().min(1)),
  approval_refs: z.array(z.string().min(1)),
}).strict();

export const RunArtifactSummary = z.object({
  artifact_id: z.string().min(1),
  kind: ArtifactKind,
  title: z.string().min(1),
  summary: z.string(),
  path_or_uri: z.string().min(1),
  created_at: z.string().datetime(),
  node_id: z.string().min(1).optional(),
  exportable: z.boolean(),
}).strict();

export const ApprovalRequestSummary = z.object({
  approval_id: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  node_id: z.string().min(1).optional(),
  requested_at: z.string().datetime().optional(),
  resolved_at: z.string().datetime().optional(),
}).strict();

export const ModelCallSummary = z.object({
  artifact_id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  role: z.string().min(1),
  model: z.string().min(1),
  created_at: z.string().datetime().optional(),
  node_id: z.string().min(1).optional(),
}).strict();

export const RunSnapshot = z.object({
  run_id: z.string().min(1),
  plan_id: z.string().min(1),
  plan_title: z.string().min(1).optional(),
  status: DurableRunStatus,
  active_node_id: z.string().min(1).optional(),
  nodes: z.array(RunNodeSnapshot),
  timeline: z.array(RunEvent),
  artifacts: z.array(RunArtifactSummary),
  approvals: z.array(ApprovalRequestSummary),
  model_calls: z.array(ModelCallSummary),
  policy_reports: z.array(CapabilityStepPolicyDecisionReport),
  errors: z.array(StructuredError),
  next_actions: z.array(NextActionSchema),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  builder_session_id: z.string().min(1).optional(),
  plan_markdown: z.string().optional(),
}).strict();

export type RunNodeStatus = z.infer<typeof RunNodeStatus>;
export type RunNodeSnapshot = z.infer<typeof RunNodeSnapshot>;
export type RunArtifactSummary = z.infer<typeof RunArtifactSummary>;
export type ApprovalRequestSummary = z.infer<typeof ApprovalRequestSummary>;
export type ModelCallSummary = z.infer<typeof ModelCallSummary>;
export type RunSnapshotStatus = z.infer<typeof DurableRunStatus>;
export type RunSnapshot = z.infer<typeof RunSnapshot>;
