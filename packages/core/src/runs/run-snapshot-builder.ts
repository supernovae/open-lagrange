import { listArtifacts } from "../artifacts/artifact-viewer.js";
import { showRun } from "../artifacts/run-index.js";
import type { PlanStateStore } from "../planning/plan-state.js";
import { Planfile, type Planfile as PlanfileType } from "../planning/planfile-schema.js";
import { getStateStore } from "../storage/state-store.js";
import type { RunEvent } from "./run-event.js";
import { deriveRunNextActions } from "./run-next-action.js";
import { RunSnapshot, type RunSnapshot as RunSnapshotType } from "./run-snapshot.js";

export async function buildRunSnapshot(input: {
  readonly run_id: string;
  readonly events?: readonly RunEvent[];
  readonly planfile?: PlanfileType;
  readonly store?: PlanStateStore;
}): Promise<RunSnapshotType | undefined> {
  const store = input.store ?? getStateStore();
  const events = input.events ?? await getStateStore().listRunEvents(input.run_id);
  const execution = input.planfile || input.events ? undefined : await getStateStore().getRunExecution(input.run_id);
  const planfile = input.planfile ?? parseStoredPlanfile(execution?.planfile);
  const created = events.find((event) => event.type === "run.created");
  const planId = created?.plan_id ?? execution?.plan_id ?? showRun(input.run_id)?.related_plan_id;
  if (!planId) return undefined;
  const planState = await store.getPlanState(planId);
  const runSummary = showRun(input.run_id);
  const planTitle = stringPayload(created, "plan_title") ?? runSummary?.title ?? planfile?.goal_frame.interpreted_goal ?? planId;
  const nodeDefinitions = planfile?.nodes.map((node) => ({
    node_id: node.id,
    title: node.title,
    kind: node.kind,
    capability_refs: [...node.allowed_capability_refs],
  })) ?? planState?.node_states.map((node) => {
    const nodeEvents = events.filter((event) => event.node_id === node.node_id);
    return {
      node_id: node.node_id,
      title: firstStringPayload(nodeEvents, "title") ?? node.node_id,
      kind: firstStringPayload(nodeEvents, "kind") ?? "node",
      capability_refs: [...new Set(nodeEvents.map((event) => event.capability_ref).filter(isString))],
    };
  }) ?? [];
  const nodes = nodeDefinitions.map((node) => {
    const state = planState?.node_states.find((item) => item.node_id === node.node_id);
    const nodeEvents = events.filter((event) => event.node_id === node.node_id);
    return {
      node_id: node.node_id,
      title: node.title,
      kind: node.kind,
      status: state?.status ?? statusFromEvents(nodeEvents),
      ...(state?.started_at ? { started_at: state.started_at } : timestampFor(nodeEvents, "node.started") ? { started_at: timestampFor(nodeEvents, "node.started") } : {}),
      ...(state?.completed_at ? { completed_at: state.completed_at } : terminalTimestamp(nodeEvents) ? { completed_at: terminalTimestamp(nodeEvents) } : {}),
      capability_refs: node.capability_refs,
      artifact_refs: [...new Set([...(state?.artifacts.map((artifact) => artifact.artifact_id) ?? []), ...nodeEvents.map((event) => event.artifact_id).filter(isString)])],
      error_refs: (state?.errors ?? []).map((error, index) => `${node.node_id}:error:${index}:${error.slice(0, 24)}`),
      approval_refs: nodeEvents.map((event) => event.approval_id).filter(isString),
    };
  });
  const artifactIndex = listArtifacts();
  const eventArtifactIds = events.map((event) => event.artifact_id).filter(isString);
  const stateArtifactIds = planState?.artifact_refs.map((artifact) => artifact.artifact_id) ?? [];
  const runArtifactIds = runSummary ? [...runSummary.primary_artifact_refs, ...runSummary.supporting_artifact_refs, ...runSummary.debug_artifact_refs] : [];
  const artifactIds = new Set([...eventArtifactIds, ...stateArtifactIds, ...runArtifactIds]);
  const artifacts = artifactIndex.filter((artifact) => artifactIds.has(artifact.artifact_id) || artifact.related_run_id === input.run_id || artifact.related_plan_id === planId).map((artifact) => ({
    artifact_id: artifact.artifact_id,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    path_or_uri: artifact.path_or_uri,
    created_at: artifact.created_at,
    ...(artifact.produced_by_node_id ? { node_id: artifact.produced_by_node_id } : {}),
    exportable: artifact.exportable,
  }));
  const approvals = events.filter((event) => event.type === "approval.requested" || event.type === "approval.resolved").map((event) => ({
    approval_id: event.approval_id ?? `${event.event_id}:approval`,
    status: stringPayload(event, "status") ?? (event.type === "approval.resolved" ? "resolved" : "requested"),
    title: stringPayload(event, "title") ?? "Approval",
    summary: stringPayload(event, "summary") ?? stringPayload(event, "reason") ?? "Approval event.",
    ...(event.node_id ? { node_id: event.node_id } : {}),
    ...(event.type === "approval.requested" ? { requested_at: event.timestamp } : {}),
    ...(event.type === "approval.resolved" ? { resolved_at: event.timestamp } : {}),
  }));
  const artifactById = new Map(artifactIndex.map((artifact) => [artifact.artifact_id, artifact]));
  const modelCalls = events.filter((event) => event.type === "model_call.completed").map((event) => {
    const modelCallArtifactId = event.model_call_artifact_id ?? event.artifact_id ?? event.event_id;
    const artifact = artifactById.get(modelCallArtifactId);
    return {
      model_call_artifact_id: modelCallArtifactId,
      title: artifact?.title ?? stringPayload(event, "title") ?? "Model call",
      summary: artifact?.summary ?? stringPayload(event, "summary") ?? "Model call completed.",
      created_at: event.timestamp,
      ...(event.node_id ? { node_id: event.node_id } : {}),
    };
  });
  const policyReports = events.filter((event) => event.type === "policy.evaluated").map((event) => ({
    event_id: event.event_id,
    ...(event.node_id ? { node_id: event.node_id } : {}),
    ...(event.capability_ref ? { capability_ref: event.capability_ref } : {}),
    outcome: stringPayload(event, "outcome") ?? "unknown",
    reason: stringPayload(event, "reason") ?? "",
    evaluated_at: event.timestamp,
  }));
  const errors = [
    ...(planState?.node_states.flatMap((node) => node.errors.map((message, index) => ({ error_id: `${node.node_id}:error:${index}`, node_id: node.node_id, message, observed_at: node.completed_at ?? planState.updated_at }))) ?? []),
    ...events.filter((event) => event.type === "run.failed" || event.type === "node.failed" || event.type === "capability.failed").map((event) => ({
      error_id: event.event_id,
      ...(event.node_id ? { node_id: event.node_id } : {}),
      message: stringPayload(event, "error") ?? stringPayload(event, "message") ?? `${event.type}`,
      observed_at: event.timestamp,
    })),
  ];
  const status = runStatus(events, planState?.status, runSummary?.status);
  const activeNodeId = activeNode(events, nodes);
  const startedAt = events.find((event) => event.type === "run.started")?.timestamp ?? created?.timestamp ?? runSummary?.started_at ?? planState?.created_at ?? new Date(0).toISOString();
  const completedAt = terminalRunEvent(events)?.timestamp ?? runSummary?.completed_at ?? (status === "completed" || status === "failed" || status === "yielded" ? planState?.updated_at : undefined);
  return RunSnapshot.parse({
    run_id: input.run_id,
    plan_id: planId,
    ...(planfile?.lifecycle?.builder_session_id ? { builder_session_id: planfile.lifecycle.builder_session_id } : {}),
    plan_title: planTitle,
    status,
    ...(activeNodeId ? { active_node_id: activeNodeId } : {}),
    nodes,
    timeline: events.map((event) => ({
      event_id: event.event_id,
      timestamp: event.timestamp,
      type: event.type,
      title: timelineTitle(event),
      summary: timelineSummary(event),
      ...(event.node_id ? { node_id: event.node_id } : {}),
      ...(event.artifact_id ? { artifact_id: event.artifact_id } : {}),
      ...(event.approval_id ? { approval_id: event.approval_id } : {}),
      severity: event.type.endsWith(".failed") ? "error" : event.type.endsWith(".yielded") || event.type === "approval.requested" ? "warning" : event.type.endsWith(".completed") ? "success" : "info",
    })),
    artifacts,
    approvals,
    model_calls: modelCalls,
    policy_reports: policyReports,
    errors,
    next_actions: deriveRunNextActions({ run_id: input.run_id, status, ...(activeNodeId ? { active_node_id: activeNodeId } : {}), approvals, artifacts, errors }),
    started_at: startedAt,
    ...(completedAt ? { completed_at: completedAt } : {}),
    ...(planState?.markdown_projection ? { plan_markdown: planState.markdown_projection } : {}),
  });
}

function parseStoredPlanfile(value: unknown): PlanfileType | undefined {
  const parsed = Planfile.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function statusFromEvents(events: readonly RunEvent[]) {
  if (events.some((event) => event.type === "node.completed")) return "completed" as const;
  if (events.some((event) => event.type === "node.failed")) return "failed" as const;
  if (events.some((event) => event.type === "node.yielded")) return "yielded" as const;
  if (events.some((event) => event.type === "node.started")) return "running" as const;
  return "pending" as const;
}

function runStatus(events: readonly RunEvent[], planStatus?: string, summaryStatus?: string) {
  const terminal = terminalRunEvent(events);
  if (terminal?.type === "run.completed") return "completed" as const;
  if (terminal?.type === "run.failed") return "failed" as const;
  if (terminal?.type === "run.yielded") return "yielded" as const;
  if (events.some((event) => event.type === "run.started" || event.type === "node.started")) return "running" as const;
  if (summaryStatus === "completed" || summaryStatus === "failed" || summaryStatus === "yielded" || summaryStatus === "running") return summaryStatus;
  if (planStatus === "completed" || planStatus === "failed" || planStatus === "yielded" || planStatus === "running") return planStatus;
  return "pending" as const;
}

function terminalRunEvent(events: readonly RunEvent[]): RunEvent | undefined {
  return [...events].reverse().find((event) => event.type === "run.completed" || event.type === "run.failed" || event.type === "run.yielded");
}

function terminalTimestamp(events: readonly RunEvent[]): string | undefined {
  return [...events].reverse().find((event) => event.type === "node.completed" || event.type === "node.failed" || event.type === "node.yielded")?.timestamp;
}

function timestampFor(events: readonly RunEvent[], type: RunEvent["type"]): string | undefined {
  return events.find((event) => event.type === type)?.timestamp;
}

function activeNode(events: readonly RunEvent[], nodes: RunSnapshotType["nodes"]): string | undefined {
  const running = [...events].reverse().find((event) => event.type === "node.started" && event.node_id && !events.some((candidate) => candidate.node_id === event.node_id && (candidate.type === "node.completed" || candidate.type === "node.failed" || candidate.type === "node.yielded")));
  return running?.node_id ?? nodes.find((node) => node.status === "running")?.node_id ?? nodes.find((node) => node.status === "yielded")?.node_id ?? nodes.find((node) => node.status === "failed")?.node_id;
}

function stringPayload(event: RunEvent | undefined, key: string): string | undefined {
  const value = event?.payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstStringPayload(events: readonly RunEvent[], key: string): string | undefined {
  for (const event of events) {
    const value = stringPayload(event, key);
    if (value) return value;
  }
  return undefined;
}

function timelineTitle(event: RunEvent): string {
  return stringPayload(event, "title") ?? event.type.replace(".", " ");
}

function timelineSummary(event: RunEvent): string {
  return stringPayload(event, "summary") ?? stringPayload(event, "reason") ?? stringPayload(event, "message") ?? event.type;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
