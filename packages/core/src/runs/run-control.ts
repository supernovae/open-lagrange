import { z } from "zod";
import { RunSnapshot } from "./run-snapshot.js";
import { NodeAttempt as NodeAttemptSchema, RetryReplayMode, apiReplayMode, type NodeAttempt as NodeAttemptType } from "./node-attempt.js";
import { DurableRunStatus, RunRuntime } from "./run.js";

export { apiReplayMode, cliReplayMode } from "./node-attempt.js";
export type { ReplayMode, RetryReplayMode } from "./node-attempt.js";

export const RunExecutionRecord = z.object({
  run_id: z.string().min(1),
  plan_id: z.string().min(1),
  plan_digest: z.string().min(1),
  plan_title: z.string().min(1).optional(),
  runtime: RunRuntime,
  profile_name: z.string().min(1).optional(),
  status: DurableRunStatus,
  planfile: z.unknown(),
  hatchet_run_id: z.string().min(1).optional(),
  output_dir: z.string().min(1).optional(),
  last_continuation_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  active_node_id: z.string().min(1).optional(),
  artifact_refs: z.array(z.string().min(1)).default([]),
  approval_refs: z.array(z.string().min(1)).default([]),
  model_call_refs: z.array(z.string().min(1)).default([]),
  error_refs: z.array(z.string().min(1)).default([]),
}).strict();

export const RunContinuationRecord = z.object({
  continuation_id: z.string().min(1),
  run_id: z.string().min(1),
  kind: z.enum(["resume", "retry", "cancel"]),
  status: z.enum(["queued", "running", "completed", "failed"]),
  node_id: z.string().min(1).optional(),
  replay_mode: RetryReplayMode.optional(),
  hatchet_run_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export const RunUiState = z.object({
  run_id: z.string().min(1),
  session_key: z.string().min(1),
  active_tab: z.string().min(1).optional(),
  selected_node_id: z.string().min(1).optional(),
  selected_artifact_id: z.string().min(1).optional(),
  selected_approval_id: z.string().min(1).optional(),
  selected_model_call_id: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  last_viewed_event_id: z.string().min(1).optional(),
  updated_at: z.string().datetime(),
}).strict();

export type RunExecutionRecord = z.infer<typeof RunExecutionRecord>;
export type RunContinuationRecord = z.infer<typeof RunContinuationRecord>;
export type NodeAttempt = NodeAttemptType;
export type RunUiState = z.infer<typeof RunUiState>;

export interface RunControlStore {
  readonly recordRunExecution: (record: RunExecutionRecord) => Promise<RunExecutionRecord>;
  readonly getRunExecution: (runId: string) => Promise<RunExecutionRecord | undefined>;
  readonly recordRunContinuation: (record: RunContinuationRecord) => Promise<RunContinuationRecord>;
  readonly getRunContinuation: (continuationId: string) => Promise<RunContinuationRecord | undefined>;
  readonly recordNodeAttempt: (attempt: NodeAttempt) => Promise<NodeAttempt>;
  readonly listNodeAttempts: (runId: string, nodeId?: string) => Promise<readonly NodeAttempt[]>;
  readonly recordRunUiState: (state: RunUiState) => Promise<RunUiState>;
  readonly getRunUiState: (runId: string, sessionKey: string) => Promise<RunUiState | undefined>;
}

const executions = new Map<string, RunExecutionRecord>();
const continuations = new Map<string, RunContinuationRecord>();
const attempts = new Map<string, NodeAttempt[]>();
const uiStates = new Map<string, RunUiState>();

export const inMemoryRunControlStore: RunControlStore = {
  async recordRunExecution(record) {
    const parsed = RunExecutionRecord.parse(record);
    executions.set(parsed.run_id, parsed);
    return parsed;
  },
  async getRunExecution(runId) {
    return executions.get(runId);
  },
  async recordRunContinuation(record) {
    const parsed = RunContinuationRecord.parse(record);
    continuations.set(parsed.continuation_id, parsed);
    return parsed;
  },
  async getRunContinuation(continuationId) {
    return continuations.get(continuationId);
  },
  async recordNodeAttempt(attempt) {
    const parsed = NodeAttemptSchema.parse(attempt);
    const items = attempts.get(parsed.run_id) ?? [];
    attempts.set(parsed.run_id, [...items.filter((item) => item.attempt_id !== parsed.attempt_id), parsed]);
    return parsed;
  },
  async listNodeAttempts(runId, nodeId) {
    const items = attempts.get(runId) ?? [];
    return nodeId ? items.filter((item) => item.node_id === nodeId) : items;
  },
  async recordRunUiState(state) {
    const parsed = RunUiState.parse(state);
    uiStates.set(uiStateKey(parsed.run_id, parsed.session_key), parsed);
    return parsed;
  },
  async getRunUiState(runId, sessionKey) {
    return uiStates.get(uiStateKey(runId, sessionKey));
  },
};

export const RunRetryRequest = z.object({
  replay_mode: z.preprocess((value) => typeof value === "string" ? apiReplayMode(value) : value, RetryReplayMode),
}).strict();

export type RunRetryRequest = z.infer<typeof RunRetryRequest>;

export function runUiStateKey(runId: string, sessionKey: string): string {
  return uiStateKey(runId, sessionKey);
}

export function snapshotStatusFromExecution(record: RunExecutionRecord): z.infer<typeof RunSnapshot>["status"] {
  return record.status;
}

function uiStateKey(runId: string, sessionKey: string): string {
  return `${runId}:${sessionKey}`;
}
