import { z } from "zod";
import { ArtifactKind } from "../artifacts/artifact-model.js";
import { PlanNodeStatus } from "../planning/planfile-schema.js";

export const RunSnapshotStatus = z.enum(["pending", "running", "completed", "failed", "yielded"]);
export const NextActionType = z.enum(["approve", "reject", "resume", "retry", "configure_provider", "inspect_artifact", "export", "edit_plan"]);

export const NextAction = z.object({
  label: z.string().min(1),
  command: z.string().min(1),
  action_type: NextActionType,
  required: z.boolean(),
}).strict();

export const RunNodeSnapshot = z.object({
  node_id: z.string().min(1),
  title: z.string().min(1),
  kind: z.string().min(1),
  status: PlanNodeStatus,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  capability_refs: z.array(z.string().min(1)),
  artifact_refs: z.array(z.string().min(1)),
  error_refs: z.array(z.string().min(1)),
  approval_refs: z.array(z.string().min(1)),
}).strict();

export const RunTimelineItem = z.object({
  event_id: z.string().min(1),
  timestamp: z.string().datetime(),
  type: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  node_id: z.string().min(1).optional(),
  artifact_id: z.string().min(1).optional(),
  approval_id: z.string().min(1).optional(),
  severity: z.enum(["info", "success", "warning", "error"]),
}).strict();

export const RunArtifactSnapshot = z.object({
  artifact_id: z.string().min(1),
  kind: ArtifactKind,
  title: z.string().min(1),
  summary: z.string(),
  path_or_uri: z.string().min(1),
  created_at: z.string().datetime(),
  node_id: z.string().min(1).optional(),
  exportable: z.boolean(),
}).strict();

export const RunApprovalSnapshot = z.object({
  approval_id: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  node_id: z.string().min(1).optional(),
  requested_at: z.string().datetime().optional(),
  resolved_at: z.string().datetime().optional(),
}).strict();

export const RunModelCallSnapshot = z.object({
  model_call_artifact_id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  created_at: z.string().datetime().optional(),
  node_id: z.string().min(1).optional(),
}).strict();

export const RunPolicyReportSnapshot = z.object({
  event_id: z.string().min(1),
  node_id: z.string().min(1).optional(),
  capability_ref: z.string().min(1).optional(),
  outcome: z.string().min(1),
  reason: z.string(),
  evaluated_at: z.string().datetime(),
}).strict();

export const RunErrorSnapshot = z.object({
  error_id: z.string().min(1),
  node_id: z.string().min(1).optional(),
  message: z.string(),
  observed_at: z.string().datetime(),
}).strict();

export const RunSnapshot = z.object({
  run_id: z.string().min(1),
  plan_id: z.string().min(1),
  builder_session_id: z.string().min(1).optional(),
  plan_title: z.string().min(1),
  status: RunSnapshotStatus,
  active_node_id: z.string().min(1).optional(),
  nodes: z.array(RunNodeSnapshot),
  timeline: z.array(RunTimelineItem),
  artifacts: z.array(RunArtifactSnapshot),
  approvals: z.array(RunApprovalSnapshot),
  model_calls: z.array(RunModelCallSnapshot),
  policy_reports: z.array(RunPolicyReportSnapshot),
  errors: z.array(RunErrorSnapshot),
  next_actions: z.array(NextAction),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  plan_markdown: z.string().optional(),
}).strict();

export type NextActionType = z.infer<typeof NextActionType>;
export type NextAction = z.infer<typeof NextAction>;
export type RunNodeSnapshot = z.infer<typeof RunNodeSnapshot>;
export type RunTimelineItem = z.infer<typeof RunTimelineItem>;
export type RunArtifactSnapshot = z.infer<typeof RunArtifactSnapshot>;
export type RunApprovalSnapshot = z.infer<typeof RunApprovalSnapshot>;
export type RunModelCallSnapshot = z.infer<typeof RunModelCallSnapshot>;
export type RunPolicyReportSnapshot = z.infer<typeof RunPolicyReportSnapshot>;
export type RunErrorSnapshot = z.infer<typeof RunErrorSnapshot>;
export type RunSnapshotStatus = z.infer<typeof RunSnapshotStatus>;
export type RunSnapshot = z.infer<typeof RunSnapshot>;
