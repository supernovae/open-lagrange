import { z } from "zod";
import { RunSnapshot } from "./run-snapshot.js";

export const ReplayMode = z.enum(["reuse-artifacts", "refresh-artifacts", "force-new-idempotency-key"]);
export type ReplayMode = z.infer<typeof ReplayMode>;

export const RunExecutionRecord = z.object({
  run_id: z.string().min(1),
  plan_id: z.string().min(1),
  status: z.enum(["pending", "running", "completed", "failed", "yielded", "cancel_requested", "cancelled"]),
  planfile: z.unknown(),
  hatchet_run_id: z.string().min(1).optional(),
  output_dir: z.string().min(1).optional(),
  cancel_requested_at: z.string().datetime().optional(),
  last_continuation_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export const RunContinuationRecord = z.object({
  continuation_id: z.string().min(1),
  run_id: z.string().min(1),
  kind: z.enum(["resume", "retry", "cancel"]),
  status: z.enum(["queued", "running", "completed", "failed"]),
  node_id: z.string().min(1).optional(),
  replay_mode: ReplayMode.optional(),
  hatchet_run_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export const NodeAttempt = z.object({
  attempt_id: z.string().min(1),
  run_id: z.string().min(1),
  node_id: z.string().min(1),
  replay_mode: ReplayMode,
  idempotency_key: z.string().min(1),
  input_artifact_refs: z.array(z.string()),
  output_artifact_refs: z.array(z.string()),
  previous_attempt_id: z.string().min(1).optional(),
  policy_report: z.unknown().optional(),
  status: z.enum(["queued", "running", "completed", "failed", "yielded"]),
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
export type NodeAttempt = z.infer<typeof NodeAttempt>;
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
    const parsed = NodeAttempt.parse(attempt);
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
  replay_mode: ReplayMode,
}).strict();

export type RunRetryRequest = z.infer<typeof RunRetryRequest>;

export function runUiStateKey(runId: string, sessionKey: string): string {
  return uiStateKey(runId, sessionKey);
}

export function snapshotStatusFromExecution(record: RunExecutionRecord): z.infer<typeof RunSnapshot>["status"] {
  if (record.status === "cancel_requested") return "yielded";
  if (record.status === "cancelled") return "failed";
  return record.status;
}

function uiStateKey(runId: string, sessionKey: string): string {
  return `${runId}:${sessionKey}`;
}
