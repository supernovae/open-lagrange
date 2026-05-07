import { ArtifactKind } from "../artifacts/artifact-model.js";
import { listArtifacts } from "../artifacts/artifact-viewer.js";
import type { PlanStateStore } from "../planning/plan-state.js";
import { Planfile, type Planfile as PlanfileType } from "../planning/planfile-schema.js";
import { getStateStore } from "../storage/state-store.js";
import type { RunEvent } from "./run-event.js";
import { cliReplayMode } from "./node-attempt.js";
import { deriveRunNextActions } from "./run-next-action.js";
import { RunSnapshot, type RunSnapshot as RunSnapshotType } from "./run-snapshot.js";

export async function buildRunSnapshot(input: {
  readonly run_id: string;
  readonly events?: readonly RunEvent[];
  readonly planfile?: PlanfileType;
  readonly store?: PlanStateStore;
}): Promise<RunSnapshotType | undefined> {
  const stateStore = input.store ?? getStateStore();
  const controlStore = input.events ? undefined : getStateStore();
  const events = input.events ?? (await controlStore?.listRunEvents(input.run_id) ?? []).map((envelope) => envelope.event);
  const run = input.events || input.planfile ? undefined : await controlStore?.getRunExecution(input.run_id);
  const planfile = input.planfile ?? parseStoredPlanfile(run?.planfile);
  const created = events.find((event) => event.type === "run.created");
  const planId = created?.plan_id ?? run?.plan_id ?? planfile?.plan_id;
  if (!planId) return undefined;
  const planState = await stateStore.getPlanState(planId);
  const attempts = await controlStore?.listNodeAttempts(input.run_id) ?? [];
  const planTitle = run?.plan_title ?? planfile?.goal_frame.interpreted_goal;
  const nodeDefinitions = planfile?.nodes.map((node) => ({
    node_id: node.id,
    title: node.title,
    kind: node.kind,
    capability_refs: [...node.allowed_capability_refs],
  })) ?? planState?.node_states.map((node) => {
    const nodeEvents = events.filter((event) => "node_id" in event && event.node_id === node.node_id);
    return {
      node_id: node.node_id,
      title: firstEventTitle(nodeEvents) ?? node.node_id,
      kind: firstEventKind(nodeEvents) ?? "node",
      capability_refs: [...new Set(nodeEvents.map((event) => "capability_ref" in event ? event.capability_ref : undefined).filter(isString))],
    };
  }) ?? [];
  const nodes = nodeDefinitions.map((node) => {
    const state = planState?.node_states.find((item) => item.node_id === node.node_id);
    const nodeEvents = events.filter((event) => "node_id" in event && event.node_id === node.node_id);
    const nodeAttempts = attempts.filter((attempt) => attempt.node_id === node.node_id).sort((left, right) => left.attempt_number - right.attempt_number);
    const currentAttempt = nodeAttempts.at(-1);
    return {
      node_id: node.node_id,
      title: node.title,
      kind: node.kind,
      status: nodeStatus(state?.status, nodeEvents),
      ...(currentAttempt ? { current_attempt_id: currentAttempt.attempt_id } : {}),
      attempts: nodeAttempts.map((attempt) => ({
        attempt_id: attempt.attempt_id,
        attempt_number: attempt.attempt_number,
        replay_mode: attempt.replay_mode,
        status: attempt.status,
        started_at: attempt.started_at,
        ...(attempt.completed_at ? { completed_at: attempt.completed_at } : {}),
        output_artifact_refs: [...attempt.output_artifact_refs],
      })),
      ...(state?.started_at ? { started_at: state.started_at } : timestampFor(nodeEvents, "node.started") ? { started_at: timestampFor(nodeEvents, "node.started") } : {}),
      ...(state?.completed_at ? { completed_at: state.completed_at } : terminalTimestamp(nodeEvents) ? { completed_at: terminalTimestamp(nodeEvents) } : {}),
      capability_refs: node.capability_refs,
      artifact_refs: [...new Set([...(state?.artifacts.map((artifact) => artifact.artifact_id) ?? []), ...nodeEvents.flatMap(eventArtifactRefs)])],
      error_refs: [...new Set([...(state?.errors ?? []).map((error, index) => `${node.node_id}:error:${index}:${error.slice(0, 24)}`), ...nodeEvents.filter((event) => event.type === "node.failed" || event.type === "capability.failed").map((event) => event.event_id)])],
      approval_refs: nodeEvents.map((event) => "approval_id" in event ? event.approval_id : undefined).filter(isString),
    };
  });
  const artifactIndex = listArtifacts();
  const eventArtifactIds = events.flatMap(eventArtifactRefs);
  const stateArtifactIds = planState?.artifact_refs.map((artifact) => artifact.artifact_id) ?? [];
  const runArtifactIds = run?.artifact_refs ?? [];
  const artifactIds = new Set([...eventArtifactIds, ...stateArtifactIds, ...runArtifactIds]);
  const indexedArtifacts = artifactIndex.filter((artifact) => artifactIds.has(artifact.artifact_id) || artifact.related_run_id === input.run_id || artifact.related_plan_id === planId).map((artifact) => ({
    artifact_id: artifact.artifact_id,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    path_or_uri: artifact.path_or_uri,
    created_at: artifact.created_at,
    ...(artifact.produced_by_node_id ? { node_id: artifact.produced_by_node_id } : {}),
    exportable: artifact.exportable,
  }));
  const indexedArtifactIds = new Set(indexedArtifacts.map((artifact) => artifact.artifact_id));
  const eventOnlyArtifacts = events.flatMap((event) => {
    if (event.type !== "artifact.created" || indexedArtifactIds.has(event.artifact_id)) return [];
    const kind = ArtifactKind.safeParse(event.kind).success ? event.kind : "capability_step_result";
    return [{
      artifact_id: event.artifact_id,
      kind,
      title: event.kind,
      summary: `${event.kind} artifact created.`,
      path_or_uri: `artifact://${event.artifact_id}`,
      created_at: event.timestamp,
      ...(event.node_id ? { node_id: event.node_id } : {}),
      exportable: true,
    }];
  });
  const artifacts = [...indexedArtifacts, ...eventOnlyArtifacts];
  const approvals = buildApprovals(events);
  const artifactById = new Map(artifactIndex.map((artifact) => [artifact.artifact_id, artifact]));
  const modelCalls = events.filter((event) => event.type === "model_call.completed").map((event) => {
    const artifact = artifactById.get(event.artifact_id);
    return {
      artifact_id: event.artifact_id,
      title: artifact?.title ?? "Model call",
      summary: artifact?.summary ?? `Model call completed with ${event.model}.`,
      role: event.role,
      model: event.model,
      created_at: event.timestamp,
      ...(event.node_id ? { node_id: event.node_id } : {}),
    };
  });
  const errors = [
    ...(planState?.node_states.flatMap((node) => node.errors.map((message) => ({ code: "MCP_EXECUTION_FAILED" as const, message, task_id: node.node_id, observed_at: node.completed_at ?? planState.updated_at }))) ?? []),
    ...events.flatMap((event) => {
      if (event.type !== "run.failed" && event.type !== "node.failed" && event.type !== "capability.failed") return [];
      return event.errors;
    }),
  ];
  const status = run?.status ?? runStatus(events, planState?.status);
  const activeNodeId = run?.active_node_id ?? activeNode(events, nodes);
  const startedAt = run?.started_at ?? events.find((event) => event.type === "run.started")?.timestamp ?? planState?.created_at;
  const completedAt = run?.completed_at ?? terminalRunEvent(events)?.timestamp ?? (status === "completed" || status === "failed" || status === "yielded" || status === "cancelled" ? planState?.updated_at : undefined);
  const nextActionsFromEvent = [...events].reverse().find((event) => event.type === "run.yielded" || event.type === "node.yielded");
  const nextActions = nextActionsFromEvent && "next_actions" in nextActionsFromEvent && nextActionsFromEvent.next_actions.length > 0
    ? nextActionsFromEvent.next_actions
    : deriveRunNextActions({ run_id: input.run_id, status, ...(activeNodeId ? { active_node_id: activeNodeId } : {}), approvals, artifacts, errors });
  return RunSnapshot.parse({
    run_id: input.run_id,
    plan_id: planId,
    ...(planTitle ? { plan_title: planTitle } : {}),
    status,
    runtime: run?.runtime ?? "local_dev",
    ...(activeNodeId ? { active_node_id: activeNodeId } : {}),
    nodes,
    timeline: events,
    artifacts,
    approvals,
    model_calls: modelCalls,
    policy_reports: events.filter(hasPolicyReport).map((event) => event.policy_report),
    errors,
    next_actions: nextActions,
    ...(startedAt ? { started_at: startedAt } : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
    ...(planfile?.lifecycle?.builder_session_id ? { builder_session_id: planfile.lifecycle.builder_session_id } : {}),
    ...(planState?.markdown_projection ? { plan_markdown: planState.markdown_projection } : {}),
  });
}

function parseStoredPlanfile(value: unknown): PlanfileType | undefined {
  const parsed = Planfile.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function nodeStatus(status: string | undefined, events: readonly RunEvent[]): RunSnapshotType["nodes"][number]["status"] {
  if (status === "pending" || status === "ready" || status === "running" || status === "yielded" || status === "failed" || status === "completed" || status === "skipped") return status;
  if (status === "requires_approval") return "requires_approval";
  if (events.some((event) => event.type === "node.completed")) return "completed";
  if (events.some((event) => event.type === "node.failed")) return "failed";
  if (events.some((event) => event.type === "node.yielded")) return "yielded";
  if (events.some((event) => event.type === "node.started")) return "running";
  return "pending";
}

function runStatus(events: readonly RunEvent[], planStatus?: string): RunSnapshotType["status"] {
  const terminal = terminalRunEvent(events);
  if (terminal?.type === "run.completed") return "completed";
  if (terminal?.type === "run.failed") return "failed";
  if (terminal?.type === "run.yielded") return "yielded";
  if (terminal?.type === "run.cancelled") return "cancelled";
  if (events.some((event) => event.type === "run.started" || event.type === "node.started")) return "running";
  if (planStatus === "completed" || planStatus === "failed" || planStatus === "yielded" || planStatus === "running") return planStatus;
  return "queued";
}

function terminalRunEvent(events: readonly RunEvent[]): RunEvent | undefined {
  return [...events].reverse().find((event) => event.type === "run.completed" || event.type === "run.failed" || event.type === "run.yielded" || event.type === "run.cancelled");
}

function terminalTimestamp(events: readonly RunEvent[]): string | undefined {
  return [...events].reverse().find((event) => event.type === "node.completed" || event.type === "node.failed" || event.type === "node.yielded")?.timestamp;
}

function timestampFor(events: readonly RunEvent[], type: RunEvent["type"]): string | undefined {
  return events.find((event) => event.type === type)?.timestamp;
}

function activeNode(events: readonly RunEvent[], nodes: RunSnapshotType["nodes"]): string | undefined {
  const running = [...events].reverse().find((event) => event.type === "node.started" && !events.some((candidate) => "node_id" in candidate && candidate.node_id === event.node_id && (candidate.type === "node.completed" || candidate.type === "node.failed" || candidate.type === "node.yielded")));
  return running && "node_id" in running ? running.node_id : nodes.find((node) => node.status === "running")?.node_id ?? nodes.find((node) => node.status === "yielded" || node.status === "requires_approval")?.node_id ?? nodes.find((node) => node.status === "failed")?.node_id;
}

function firstEventTitle(events: readonly RunEvent[]): string | undefined {
  const event = events.find((candidate) => "title" in candidate && typeof candidate.title === "string");
  return event && "title" in event ? event.title : undefined;
}

function firstEventKind(events: readonly RunEvent[]): string | undefined {
  return events.find((event) => event.type === "artifact.created")?.kind;
}

function eventArtifactRefs(event: RunEvent): string[] {
  if (event.type === "artifact.created" || event.type === "model_call.completed") return [event.artifact_id];
  if (event.type === "run.completed" || event.type === "node.completed" || event.type === "capability.completed") return event.artifact_refs;
  return [];
}

function buildApprovals(events: readonly RunEvent[]) {
  const byId = new Map<string, {
    approval_id: string;
    status: string;
    title: string;
    summary: string;
    node_id?: string;
    requested_at?: string;
    resolved_at?: string;
  }>();
  for (const event of events) {
    if (event.type === "approval.requested") {
      byId.set(event.approval_id, {
        approval_id: event.approval_id,
        status: "requested",
        title: "Approval",
        summary: "Approval requested.",
        ...(event.node_id ? { node_id: event.node_id } : {}),
        requested_at: event.timestamp,
      });
    }
    if (event.type === "approval.resolved") {
      const existing = byId.get(event.approval_id);
      const nodeId = event.node_id ?? existing?.node_id;
      byId.set(event.approval_id, {
        approval_id: event.approval_id,
        status: event.decision,
        title: event.decision === "approved" ? "Approval granted" : "Approval rejected",
        summary: `Approval ${event.decision}.`,
        ...(nodeId ? { node_id: nodeId } : {}),
        ...(existing?.requested_at ? { requested_at: existing.requested_at } : {}),
        resolved_at: event.timestamp,
      });
    }
  }
  return [...byId.values()];
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasPolicyReport(event: RunEvent): event is Extract<RunEvent, { type: "policy.evaluated" }> & { policy_report: NonNullable<Extract<RunEvent, { type: "policy.evaluated" }>["policy_report"]> } {
  return event.type === "policy.evaluated" && Boolean(event.policy_report);
}
