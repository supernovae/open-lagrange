import { z } from "zod";

export const ReplayMode = z.enum(["initial", "reuse_artifacts", "refresh_artifacts", "force_new_idempotency_key"]);
export const RetryReplayMode = ReplayMode.exclude(["initial"]);

export const NodeAttemptStatus = z.enum(["running", "completed", "failed", "yielded", "requires_approval"]);

export const NodeAttempt = z.object({
  attempt_id: z.string().min(1),
  run_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  attempt_number: z.number().int().min(1),
  replay_mode: ReplayMode,
  idempotency_key: z.string().min(1),
  previous_attempt_id: z.string().min(1).optional(),
  input_artifact_refs: z.array(z.string().min(1)),
  output_artifact_refs: z.array(z.string().min(1)),
  status: NodeAttemptStatus,
  policy_report_ref: z.string().min(1).optional(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
}).strict();

export const NodeAttemptSummary = z.object({
  attempt_id: z.string().min(1),
  attempt_number: z.number().int().min(1),
  replay_mode: ReplayMode,
  status: NodeAttemptStatus,
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  output_artifact_refs: z.array(z.string().min(1)),
}).strict();

export type ReplayMode = z.infer<typeof ReplayMode>;
export type RetryReplayMode = z.infer<typeof RetryReplayMode>;
export type NodeAttemptStatus = z.infer<typeof NodeAttemptStatus>;
export type NodeAttempt = z.infer<typeof NodeAttempt>;
export type NodeAttemptSummary = z.infer<typeof NodeAttemptSummary>;

export function apiReplayMode(value: string): RetryReplayMode {
  if (value === "reuse-artifacts") return "reuse_artifacts";
  if (value === "refresh-artifacts") return "refresh_artifacts";
  if (value === "force-new-idempotency-key") return "force_new_idempotency_key";
  return RetryReplayMode.parse(value);
}

export function cliReplayMode(value: ReplayMode): string {
  return value.replaceAll("_", "-");
}
