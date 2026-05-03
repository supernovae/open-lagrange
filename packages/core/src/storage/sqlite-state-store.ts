import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ApprovalContinuationContext, ApprovalContinuationEnvelope, ApprovalDecision, ApprovalRequest, WorkflowStatusSnapshot, type ApprovalContinuationContext as ApprovalContinuationContextType, type ApprovalContinuationEnvelope as ApprovalContinuationEnvelopeType, type ApprovalDecision as ApprovalDecisionType, type ApprovalRequest as ApprovalRequestType, type WorkflowStatusSnapshot as WorkflowStatusSnapshotType } from "../schemas/reconciliation.js";
import { approvalTokenForRequest, approvalTokenHash } from "../approval/approval-token.js";
import { Observation, StructuredError, type Observation as ObservationType, type StructuredError as StructuredErrorType } from "../schemas/open-cot.js";
import { PlanState } from "../planning/plan-state.js";
import { NodeAttempt, RunContinuationRecord, RunExecutionRecord, RunUiState } from "../runs/run-control.js";
import { RunEvent } from "../runs/run-event.js";
import { eventsAfter } from "../runs/run-event-store.js";
import { parseTaskStatus, type TaskStatusSnapshot } from "../status/status-store.js";
import type { OpenLagrangeStateStore } from "./state-store.js";

export interface SqliteStateStoreOptions {
  readonly path: string;
}

export function createSqliteStateStore(options: SqliteStateStoreOptions): OpenLagrangeStateStore {
  const dbPath = resolve(options.path);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    create table if not exists project_statuses (
      lookup_id text primary key,
      project_id text not null,
      project_run_id text not null,
      snapshot_json text not null,
      updated_at text not null
    );
    create table if not exists task_statuses (
      task_run_id text primary key,
      task_id text not null,
      project_id text not null,
      snapshot_json text not null,
      updated_at text not null
    );
    create index if not exists task_statuses_task_id_idx on task_statuses(task_id);
    create index if not exists task_statuses_project_id_idx on task_statuses(project_id);
    create table if not exists approval_decisions (
      approval_request_id text primary key,
      task_id text not null,
      task_run_id text not null,
      project_id text not null,
      decision_json text not null,
      updated_at text not null
    );
    create table if not exists continuation_contexts (
      approval_request_id text primary key,
      task_id text not null,
      task_run_id text not null,
      project_id text not null,
      context_json text not null,
      updated_at text not null
    );
    create table if not exists approval_continuation_envelopes (
      approval_request_id text primary key,
      kind text not null,
      task_run_id text not null,
      project_id text not null,
      envelope_json text not null,
      updated_at text not null
    );
    create table if not exists plan_states (
      plan_id text primary key,
      state_json text not null,
      updated_at text not null
    );
    create table if not exists run_events (
      event_id text primary key,
      run_id text not null,
      plan_id text not null,
      type text not null,
      event_json text not null,
      timestamp text not null
    );
    create index if not exists run_events_run_id_idx on run_events(run_id, timestamp);
    create index if not exists run_events_timestamp_idx on run_events(timestamp);
    create table if not exists run_executions (
      run_id text primary key,
      plan_id text not null,
      status text not null,
      record_json text not null,
      updated_at text not null
    );
    create table if not exists run_continuations (
      continuation_id text primary key,
      run_id text not null,
      kind text not null,
      status text not null,
      record_json text not null,
      updated_at text not null
    );
    create index if not exists run_continuations_run_id_idx on run_continuations(run_id, updated_at);
    create table if not exists node_attempts (
      attempt_id text primary key,
      run_id text not null,
      node_id text not null,
      record_json text not null,
      updated_at text not null
    );
    create index if not exists node_attempts_run_node_idx on node_attempts(run_id, node_id, updated_at);
    create table if not exists run_ui_states (
      lookup_id text primary key,
      run_id text not null,
      session_key text not null,
      state_json text not null,
      updated_at text not null
    );
  `);

  return {
    async recordProjectStatus(snapshot) {
      const parsed = WorkflowStatusSnapshot.parse(snapshot);
      const json = JSON.stringify(parsed);
      const statement = db.prepare(`
        insert into project_statuses (lookup_id, project_id, project_run_id, snapshot_json, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(lookup_id) do update set
          project_id = excluded.project_id,
          project_run_id = excluded.project_run_id,
          snapshot_json = excluded.snapshot_json,
          updated_at = excluded.updated_at
      `);
      statement.run(parsed.project_id, parsed.project_id, parsed.project_run_id, json, parsed.updated_at);
      statement.run(parsed.project_run_id, parsed.project_id, parsed.project_run_id, json, parsed.updated_at);
      return parsed;
    },
    async recordTaskStatus(snapshot) {
      const parsed = parseTaskStatus(snapshot);
      db.prepare(`
        insert into task_statuses (task_run_id, task_id, project_id, snapshot_json, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(task_run_id) do update set
          task_id = excluded.task_id,
          project_id = excluded.project_id,
          snapshot_json = excluded.snapshot_json,
          updated_at = excluded.updated_at
      `).run(parsed.task_run_id, parsed.task_id, parsed.project_id, JSON.stringify(parsed), parsed.updated_at);
      return parsed;
    },
    async getProjectStatus(projectIdOrRunId) {
      return readJson(db, "select snapshot_json from project_statuses where lookup_id = ?", [projectIdOrRunId], WorkflowStatusSnapshot);
    },
    async getTaskStatus(taskRunId) {
      return readTaskStatus(db, "select snapshot_json from task_statuses where task_run_id = ?", [taskRunId]);
    },
    async getTaskStatusByTaskId(taskId) {
      return readTaskStatus(db, "select snapshot_json from task_statuses where task_id = ? order by updated_at desc limit 1", [taskId]);
    },
    async listTaskStatusesForProject(projectId) {
      const rows = db.prepare("select snapshot_json from task_statuses where project_id = ? order by updated_at asc").all(projectId);
      return rows.map((row) => parseTaskStatus(JSON.parse(String((row as Record<string, unknown>).snapshot_json)) as TaskStatusSnapshot));
    },
    async appendObservation(projectIdOrRunId, item) {
      const status = await this.getProjectStatus(projectIdOrRunId);
      if (!status) return;
      const observation = Observation.parse(item);
      await this.recordProjectStatus({
        ...status,
        observations: [...status.observations, observation],
        updated_at: observation.observed_at,
      });
    },
    async appendStructuredError(projectIdOrRunId, item) {
      const status = await this.getProjectStatus(projectIdOrRunId);
      if (!status) return;
      const error = StructuredError.parse(item);
      await this.recordProjectStatus({
        ...status,
        errors: [...status.errors, error],
        updated_at: error.observed_at,
      });
    },
    async createApprovalRequest(request) {
      const parsed = ApprovalRequest.parse(request);
      const decision = ApprovalDecision.parse({
        approval_request_id: parsed.approval_request_id,
        task_id: parsed.task_id,
        project_id: parsed.project_id,
        intent_id: parsed.intent_id,
        requested_risk_level: parsed.requested_risk_level,
        requested_capability: parsed.requested_capability,
        requested_at: parsed.requested_at,
        decision: "requested",
        approval_token_hash: approvalTokenHash(parsed.approval_request_id, approvalTokenForRequest(parsed.approval_request_id)),
        trace_id: parsed.trace_id,
      });
      writeApproval(db, parsed, decision, parsed.requested_at);
      return decision;
    },
    async getApprovalDecision(approvalRequestId) {
      return readJson(db, "select decision_json from approval_decisions where approval_request_id = ?", [approvalRequestId], ApprovalDecision);
    },
    async getApprovalDecisionForTask(taskIdOrRunId) {
      return readJson(
        db,
        "select decision_json from approval_decisions where task_id = ? or task_run_id = ? order by updated_at desc limit 1",
        [taskIdOrRunId, taskIdOrRunId],
        ApprovalDecision,
      );
    },
    async approveRequest(approvalRequestId, approvedBy, decidedAt, reason) {
      const existing = await this.getApprovalDecision(approvalRequestId);
      if (!existing) return undefined;
      const decision = ApprovalDecision.parse({
        ...existing,
        decision: "approved",
        approved_by: approvedBy,
        decided_at: decidedAt,
        reason,
      });
      writeApprovalDecision(db, decision, decidedAt);
      return decision;
    },
    async rejectRequest(approvalRequestId, rejectedBy, decidedAt, reason) {
      const existing = await this.getApprovalDecision(approvalRequestId);
      if (!existing) return undefined;
      const decision = ApprovalDecision.parse({
        ...existing,
        decision: "rejected",
        rejected_by: rejectedBy,
        decided_at: decidedAt,
        reason,
      });
      writeApprovalDecision(db, decision, decidedAt);
      return decision;
    },
    async recordContinuationContext(context) {
      const parsed = ApprovalContinuationContext.parse(context);
      db.prepare(`
        insert into continuation_contexts (approval_request_id, task_id, task_run_id, project_id, context_json, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict(approval_request_id) do update set
          task_id = excluded.task_id,
          task_run_id = excluded.task_run_id,
          project_id = excluded.project_id,
          context_json = excluded.context_json,
          updated_at = excluded.updated_at
      `).run(
        parsed.approval_request.approval_request_id,
        parsed.scoped_task.task_id,
        parsed.task_run_id,
        parsed.parent_project_id,
        JSON.stringify(parsed),
        parsed.approval_request.requested_at,
      );
      return parsed;
    },
    async getContinuationContext(approvalRequestId) {
      return readJson(db, "select context_json from continuation_contexts where approval_request_id = ?", [approvalRequestId], ApprovalContinuationContext);
    },
    async recordApprovalContinuationEnvelope(envelope) {
      const parsed = ApprovalContinuationEnvelope.parse(envelope);
      db.prepare(`
        insert into approval_continuation_envelopes (approval_request_id, kind, task_run_id, project_id, envelope_json, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict(approval_request_id) do update set
          kind = excluded.kind,
          task_run_id = excluded.task_run_id,
          project_id = excluded.project_id,
          envelope_json = excluded.envelope_json,
          updated_at = excluded.updated_at
      `).run(
        parsed.approval_request.approval_request_id,
        parsed.kind,
        parsed.task_run_id,
        parsed.project_id,
        JSON.stringify(parsed),
        parsed.approval_request.requested_at,
      );
      return parsed;
    },
    async getApprovalContinuationEnvelope(approvalRequestId) {
      return readJson(db, "select envelope_json from approval_continuation_envelopes where approval_request_id = ?", [approvalRequestId], ApprovalContinuationEnvelope);
    },
    async recordPlanState(state) {
      const parsed = PlanState.parse(state);
      db.prepare(`
        insert into plan_states (plan_id, state_json, updated_at)
        values (?, ?, ?)
        on conflict(plan_id) do update set
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `).run(parsed.plan_id, JSON.stringify(parsed), parsed.updated_at);
      return parsed;
    },
    async getPlanState(planId) {
      return readJson(db, "select state_json from plan_states where plan_id = ?", [planId], PlanState);
    },
    async appendRunEvent(event) {
      const parsed = RunEvent.parse(event);
      db.prepare(`
        insert into run_events (event_id, run_id, plan_id, type, event_json, timestamp)
        values (?, ?, ?, ?, ?, ?)
        on conflict(event_id) do update set
          run_id = excluded.run_id,
          plan_id = excluded.plan_id,
          type = excluded.type,
          event_json = excluded.event_json,
          timestamp = excluded.timestamp
      `).run(parsed.event_id, parsed.run_id, parsed.plan_id, parsed.type, JSON.stringify(parsed), parsed.timestamp);
      return parsed;
    },
    async listRunEvents(runId) {
      const rows = db.prepare("select event_json from run_events where run_id = ? order by timestamp asc, event_id asc").all(runId);
      return rows.map((row) => RunEvent.parse(JSON.parse(String((row as Record<string, unknown>).event_json))));
    },
    async listRunEventsAfter(runId, cursorEventId) {
      return eventsAfter(await this.listRunEvents(runId), cursorEventId);
    },
    async listRecentRunIds(limit = 20) {
      const rows = db.prepare(`
        select run_id, max(timestamp) as latest_timestamp
        from run_events
        group by run_id
        order by latest_timestamp desc
        limit ?
      `).all(limit);
      return rows.map((row) => String((row as Record<string, unknown>).run_id));
    },
    async recordRunExecution(record) {
      const parsed = RunExecutionRecord.parse(record);
      db.prepare(`
        insert into run_executions (run_id, plan_id, status, record_json, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(run_id) do update set
          plan_id = excluded.plan_id,
          status = excluded.status,
          record_json = excluded.record_json,
          updated_at = excluded.updated_at
      `).run(parsed.run_id, parsed.plan_id, parsed.status, JSON.stringify(parsed), parsed.updated_at);
      return parsed;
    },
    async getRunExecution(runId) {
      return readJson(db, "select record_json from run_executions where run_id = ?", [runId], RunExecutionRecord);
    },
    async recordRunContinuation(record) {
      const parsed = RunContinuationRecord.parse(record);
      db.prepare(`
        insert into run_continuations (continuation_id, run_id, kind, status, record_json, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict(continuation_id) do update set
          run_id = excluded.run_id,
          kind = excluded.kind,
          status = excluded.status,
          record_json = excluded.record_json,
          updated_at = excluded.updated_at
      `).run(parsed.continuation_id, parsed.run_id, parsed.kind, parsed.status, JSON.stringify(parsed), parsed.updated_at);
      return parsed;
    },
    async getRunContinuation(continuationId) {
      return readJson(db, "select record_json from run_continuations where continuation_id = ?", [continuationId], RunContinuationRecord);
    },
    async recordNodeAttempt(attempt) {
      const parsed = NodeAttempt.parse(attempt);
      db.prepare(`
        insert into node_attempts (attempt_id, run_id, node_id, record_json, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(attempt_id) do update set
          run_id = excluded.run_id,
          node_id = excluded.node_id,
          record_json = excluded.record_json,
          updated_at = excluded.updated_at
      `).run(parsed.attempt_id, parsed.run_id, parsed.node_id, JSON.stringify(parsed), parsed.updated_at);
      return parsed;
    },
    async listNodeAttempts(runId, nodeId) {
      const rows = nodeId
        ? db.prepare("select record_json from node_attempts where run_id = ? and node_id = ? order by updated_at asc").all(runId, nodeId)
        : db.prepare("select record_json from node_attempts where run_id = ? order by updated_at asc").all(runId);
      return rows.map((row) => NodeAttempt.parse(JSON.parse(String((row as Record<string, unknown>).record_json))));
    },
    async recordRunUiState(state) {
      const parsed = RunUiState.parse(state);
      db.prepare(`
        insert into run_ui_states (lookup_id, run_id, session_key, state_json, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(lookup_id) do update set
          run_id = excluded.run_id,
          session_key = excluded.session_key,
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `).run(`${parsed.run_id}:${parsed.session_key}`, parsed.run_id, parsed.session_key, JSON.stringify(parsed), parsed.updated_at);
      return parsed;
    },
    async getRunUiState(runId, sessionKey) {
      return readJson(db, "select state_json from run_ui_states where lookup_id = ?", [`${runId}:${sessionKey}`], RunUiState);
    },
  };
}

function readTaskStatus(db: DatabaseSync, sql: string, values: readonly string[]): TaskStatusSnapshot | undefined {
  const row = db.prepare(sql).get(...values) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return parseTaskStatus(JSON.parse(String(row.snapshot_json)) as TaskStatusSnapshot);
}

function readJson<T>(db: DatabaseSync, sql: string, values: readonly string[], schema: { readonly parse: (input: unknown) => T }): T | undefined {
  const row = db.prepare(sql).get(...values) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const value = row.snapshot_json ?? row.decision_json ?? row.context_json ?? row.envelope_json ?? row.state_json ?? row.event_json ?? row.record_json ?? row.state_json;
  return schema.parse(JSON.parse(String(value)));
}

function writeApproval(db: DatabaseSync, request: ApprovalRequestType, decision: ApprovalDecisionType, updatedAt: string): void {
  db.prepare(`
    insert into approval_decisions (approval_request_id, task_id, task_run_id, project_id, decision_json, updated_at)
    values (?, ?, ?, ?, ?, ?)
    on conflict(approval_request_id) do update set
      task_id = excluded.task_id,
      task_run_id = excluded.task_run_id,
      project_id = excluded.project_id,
      decision_json = excluded.decision_json,
      updated_at = excluded.updated_at
  `).run(request.approval_request_id, request.task_id, request.task_run_id, request.project_id, JSON.stringify(decision), updatedAt);
}

function writeApprovalDecision(db: DatabaseSync, decision: ApprovalDecisionType, updatedAt: string): void {
  db.prepare(`
    update approval_decisions
    set decision_json = ?, updated_at = ?
    where approval_request_id = ?
  `).run(JSON.stringify(decision), updatedAt, decision.approval_request_id);
}
