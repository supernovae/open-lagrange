import { readFileSync } from "node:fs";
import { buildRunSnapshot, RunRetryRequest, RunUiState, type RunSnapshot } from "@open-lagrange/core/runs";
import { cancelRun, createRunFromBuilderSession, createRunFromPlanfile, parsePlanfileMarkdown, parsePlanfileYaml, resumeRun, retryRunNode } from "@open-lagrange/core/planning";
import { getStateStore } from "@open-lagrange/core/storage";
import { z } from "zod";
import { HttpError } from "../http";

export const CreateRunPayload = z.object({
  source: z.enum(["builder_session", "planfile", "planfile_path"]).default("planfile"),
  session_id: z.string().min(1).optional(),
  planfile: z.unknown().optional(),
  planfile_path: z.string().min(1).optional(),
  live: z.boolean().default(true),
}).strict();

export const ApprovalDecisionPayload = z.object({
  decided_by: z.string().min(1).max(128).default("web"),
  reason: z.string().min(1).max(2_000).default("Handled from Run Console."),
}).strict();

export const UiStatePayload = z.object({
  active_tab: z.string().min(1).optional(),
  selected_node_id: z.string().min(1).optional(),
  selected_artifact_id: z.string().min(1).optional(),
  selected_approval_id: z.string().min(1).optional(),
  selected_model_call_id: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  last_viewed_event_id: z.string().min(1).optional(),
}).strict();

export async function handleCreateRun(raw: unknown): Promise<unknown> {
  const payload = CreateRunPayload.parse(raw);
  if (payload.source === "builder_session") {
    if (!payload.session_id) throw new HttpError(400, { error: "SESSION_ID_REQUIRED" });
    return createRunFromBuilderSession({ session_id: payload.session_id, live: payload.live });
  }
  const planfile = payload.source === "planfile_path"
    ? parsePlanfilePath(required(payload.planfile_path, "PLANFILE_PATH_REQUIRED"))
    : required(payload.planfile, "PLANFILE_REQUIRED");
  return createRunFromPlanfile({ planfile, live: payload.live });
}

export async function handleRunSnapshot(runId: string): Promise<RunSnapshot | unknown> {
  return await buildRunSnapshot({ run_id: runId }) ?? { run_id: runId, status: "missing" };
}

export async function handleRunEvents(runId: string): Promise<unknown> {
  return { run_id: runId, events: await getStateStore().listRunEvents(runId) };
}

export async function handleResumeRun(runId: string): Promise<unknown> {
  return resumeRun({ run_id: runId });
}

export async function handleRetryRunNode(runId: string, nodeId: string, raw: unknown): Promise<unknown> {
  const payload = RunRetryRequest.parse(raw);
  const snapshot = await requireRunSnapshot(runId);
  if (!snapshot.nodes.some((node) => node.node_id === nodeId)) throw new HttpError(404, { error: "NODE_NOT_FOUND", run_id: runId, node_id: nodeId });
  return retryRunNode({ run_id: runId, node_id: nodeId, replay_mode: payload.replay_mode });
}

export async function handleCancelRun(runId: string): Promise<unknown> {
  return cancelRun({ run_id: runId });
}

export async function handleRunUiState(runId: string, request: Request): Promise<unknown> {
  return await getStateStore().getRunUiState(runId, sessionKey(request)) ?? { run_id: runId, session_key: sessionKey(request), status: "missing" };
}

export async function handleUpdateRunUiState(runId: string, request: Request, raw: unknown): Promise<unknown> {
  const payload = UiStatePayload.parse(raw);
  return getStateStore().recordRunUiState(RunUiState.parse({
    run_id: runId,
    session_key: sessionKey(request),
    ...payload,
    updated_at: new Date().toISOString(),
  }));
}

export async function handleResolveRunApproval(runId: string, approvalId: string, raw: unknown, decision: "approved" | "rejected"): Promise<unknown> {
  const payload = ApprovalDecisionPayload.parse(raw);
  const snapshot = await requireRunSnapshot(runId);
  await getStateStore().appendRunEvent({
    event_id: `approval_${approvalId}_${decision}_${Date.now().toString(36)}`,
    run_id: runId,
    plan_id: snapshot.plan_id,
    type: "approval.resolved",
    timestamp: new Date().toISOString(),
    approval_id: approvalId,
    decision,
  });
  return await requireRunSnapshot(runId);
}

function parsePlanfilePath(path: string): unknown {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".yaml") || path.endsWith(".yml") ? parsePlanfileYaml(text) : parsePlanfileMarkdown(text);
}

function required<T>(value: T | undefined, error: string): T {
  if (value === undefined) throw new HttpError(400, { error });
  return value;
}

async function requireRunSnapshot(runId: string): Promise<RunSnapshot> {
  const snapshot = await buildRunSnapshot({ run_id: runId });
  if (!snapshot) throw new HttpError(404, { error: "RUN_NOT_FOUND", run_id: runId });
  return snapshot;
}

function sessionKey(request: Request): string {
  return request.headers.get("x-open-lagrange-session") ?? request.headers.get("authorization")?.slice(0, 32) ?? "local";
}
