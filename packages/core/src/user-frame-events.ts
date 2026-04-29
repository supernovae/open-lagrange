import { z } from "zod";
import { createMockDelegationContext } from "./clients/mock-delegation.js";
import { deterministicProjectId, deterministicRepositoryTaskRunId } from "./ids/deterministic-ids.js";
import { packRegistry } from "./capability-registry/registry.js";
import { DEFAULT_EXECUTION_BOUNDS, type ProjectReconcilerInput } from "./schemas/reconciliation.js";
import type { RepositoryTaskInput } from "./schemas/repository.js";
import { approveTask, getProjectRunStatus, getTaskStatus, rejectTask, requestRepositoryVerification, submitProjectRun, submitRepositoryTask } from "./hatchet/workflow-client.js";
import { observation, structuredError } from "./reconciliation/records.js";
import { getStateStore } from "./storage/state-store.js";
import type { TaskStatusSnapshot } from "./status/status-store.js";

export const ArtifactType = z.enum(["diff", "review", "verification", "plan", "artifact_json"]);

export const UserFrameEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("submit_goal"),
    text: z.string().min(1),
    repo_path: z.string().optional(),
    workspace_id: z.string().optional(),
    dry_run: z.boolean().optional(),
    apply: z.boolean().optional(),
  }).strict(),
  z.object({ type: z.literal("refine_goal"), project_id: z.string().min(1), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal("ask_explanation"), project_id: z.string().min(1), task_id: z.string().optional(), target_id: z.string().optional(), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal("approve"), approval_request_id: z.string().min(1), task_id: z.string().min(1), reason: z.string().optional() }).strict(),
  z.object({ type: z.literal("reject"), approval_request_id: z.string().min(1), task_id: z.string().min(1), reason: z.string().min(1) }).strict(),
  z.object({ type: z.literal("request_artifact"), project_id: z.string().min(1), task_id: z.string().optional(), artifact_type: ArtifactType }).strict(),
  z.object({ type: z.literal("adjust_scope"), project_id: z.string().min(1), allowed_paths: z.array(z.string()).optional(), denied_paths: z.array(z.string()).optional(), reason: z.string().optional() }).strict(),
  z.object({ type: z.literal("request_verification"), project_id: z.string().min(1), task_id: z.string().optional(), command_id: z.string().min(1) }).strict(),
]);

export type UserFrameEvent = z.infer<typeof UserFrameEvent>;
export type ArtifactType = z.infer<typeof ArtifactType>;

export type UserFrameEventResult =
  | { readonly status: "submitted"; readonly message: string; readonly project_id?: string; readonly task_run_id?: string; readonly hatchet_run_id?: string }
  | { readonly status: "completed"; readonly message: string; readonly output?: unknown }
  | { readonly status: "unsupported"; readonly message: string; readonly event_type: UserFrameEvent["type"] }
  | { readonly status: "failed"; readonly message: string };

export interface SubmitProjectGoalInput {
  readonly goal: string;
  readonly workspace_id?: string;
}

export interface SubmitRepositoryGoalInput extends SubmitProjectGoalInput {
  readonly repo_path: string;
  readonly dry_run?: boolean;
  readonly apply?: boolean;
}

export async function submitProjectGoal(input: SubmitProjectGoalInput): Promise<UserFrameEventResult> {
  const context = createMockDelegationContext({
    goal: input.goal,
    delegate_id: "open-lagrange-tui",
    ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}),
  });
  const submitted = await submitProjectRun({
    goal: input.goal,
    delegation_context: context,
    bounds: DEFAULT_EXECUTION_BOUNDS,
  } satisfies ProjectReconcilerInput);
  return {
    status: "submitted",
    message: "Project reconciliation submitted.",
    project_id: submitted.project_id,
    hatchet_run_id: submitted.hatchet_run_id,
  };
}

export async function submitRepositoryGoal(input: SubmitRepositoryGoalInput): Promise<UserFrameEventResult> {
  const project_id = deterministicProjectId({
    goal: input.goal,
    workspace_id: input.workspace_id ?? "workspace-local",
    principal_id: "human-local",
    delegate_id: "open-lagrange-tui",
  });
  const task_run_id = deterministicRepositoryTaskRunId({
    project_id,
    repo_root: input.repo_path,
    goal: input.goal,
  });
  const context = createMockDelegationContext({
    goal: input.goal,
    project_id,
    delegate_id: "open-lagrange-tui",
    allowed_scopes: ["project:read", "project:summarize", "project:write", "repository:read", "repository:write", "repository:verify"],
    ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}),
  });
  const submitted = await submitRepositoryTask({
    goal: input.goal,
    repo_root: input.repo_path,
    task_run_id,
    project_id,
    dry_run: input.dry_run ?? !input.apply,
    apply: input.apply ?? false,
    delegation_context: {
      ...context,
      allowed_capabilities: [
        "repo.list_files",
        "repo.read_file",
        "repo.search_text",
        "repo.propose_patch",
        "repo.apply_patch",
        "repo.run_verification",
        "repo.get_diff",
        "repo.create_review_report",
      ],
      max_risk_level: "external_side_effect",
      task_run_id,
    },
    verification_command_ids: ["npm_run_typecheck"],
    ...(input.workspace_id ? { workspace_id: input.workspace_id } : {}),
  } satisfies RepositoryTaskInput);
  return {
    status: "submitted",
    message: "Repository reconciliation submitted.",
    project_id: submitted.project_id,
    task_run_id: submitted.task_run_id,
    hatchet_run_id: submitted.hatchet_run_id,
  };
}

export async function submitUserFrameEvent(rawEvent: UserFrameEvent): Promise<UserFrameEventResult> {
  const event = UserFrameEvent.parse(rawEvent);
  if (event.type === "submit_goal") {
    if (event.repo_path) {
      return submitRepositoryGoal({
        goal: event.text,
        repo_path: event.repo_path,
        ...(event.dry_run === undefined ? {} : { dry_run: event.dry_run }),
        ...(event.apply === undefined ? {} : { apply: event.apply }),
        ...(event.workspace_id ? { workspace_id: event.workspace_id } : {}),
      });
    }
    return submitProjectGoal({ goal: event.text, ...(event.workspace_id ? { workspace_id: event.workspace_id } : {}) });
  }
  if (event.type === "approve") {
    const result = await approveTask({ task_id: event.task_id, decided_by: "human-local", reason: event.reason ?? "Approved from TUI." });
    return { status: "completed", message: "Approval recorded.", output: result };
  }
  if (event.type === "reject") {
    const result = await rejectTask({ task_id: event.task_id, decided_by: "human-local", reason: event.reason });
    return { status: "completed", message: "Rejection recorded.", output: result };
  }
  if (event.type === "request_artifact") {
    return requestArtifact({
      project_id: event.project_id,
      artifact_type: event.artifact_type,
      ...(event.task_id ? { task_id: event.task_id } : {}),
    });
  }
  if (event.type === "refine_goal") return recordProjectFrameEvent(event.project_id, "Goal refinement recorded.", { text: event.text });
  if (event.type === "ask_explanation") return explainStatus(event);
  if (event.type === "adjust_scope") return recordProjectFrameEvent(event.project_id, "Scope adjustment recorded for future reconciliation.", {
    allowed_paths: event.allowed_paths ?? [],
    denied_paths: event.denied_paths ?? [],
    reason: event.reason,
  });
  if (event.type === "request_verification") return submitVerificationRequest(event);
  return { status: "failed", message: "Unknown typed user frame event." };
}

export async function requestArtifact(input: {
  readonly project_id: string;
  readonly task_id?: string;
  readonly artifact_type: ArtifactType;
}): Promise<UserFrameEventResult> {
  const status = await getProjectRunStatus(input.project_id);
  const task = input.task_id
    ? await getTaskStatus(input.task_id)
    : status.task_statuses[0];
  if (input.artifact_type === "plan") return { status: "completed", message: "Plan artifact loaded.", output: status.output?.plan };
  if (input.artifact_type === "diff") return { status: "completed", message: "Diff artifact loaded.", output: task?.repository_status?.diff_text ?? task?.repository_status?.diff_summary };
  if (input.artifact_type === "review") return { status: "completed", message: "Review artifact loaded.", output: task?.repository_status?.review_report };
  if (input.artifact_type === "verification") return { status: "completed", message: "Verification artifact loaded.", output: task?.repository_status?.verification_results ?? [] };
  return { status: "completed", message: "JSON artifact loaded.", output: task?.result ?? status };
}

async function recordProjectFrameEvent(project_id: string, summary: string, output: Record<string, unknown>): Promise<UserFrameEventResult> {
  const now = new Date().toISOString();
  await getStateStore().appendObservation(project_id, observation({
    status: "recorded",
    summary,
    now,
    output,
  }));
  return {
    status: "completed",
    message: summary,
    output,
  };
}

async function explainStatus(event: Extract<UserFrameEvent, { readonly type: "ask_explanation" }>): Promise<UserFrameEventResult> {
  const status = await getProjectRunStatus(event.project_id);
  const task = event.task_id ? await getTaskStatus(event.task_id) : status.task_statuses[0];
  const explanation = [
    status.status ? `Project is ${status.status.status}.` : "Project status has not been recorded yet.",
    task ? `Selected task is ${task.status}${task.repository_status ? ` in phase ${task.repository_status.current_phase}` : ""}.` : "No task status is available.",
    approvalLine(task),
    errorLine(task),
  ].filter(Boolean).join(" ");
  await recordProjectFrameEvent(event.project_id, "Explanation requested.", {
    question: event.text,
    explanation,
    ...(event.task_id ? { task_id: event.task_id } : {}),
    ...(event.target_id ? { target_id: event.target_id } : {}),
  });
  return {
    status: "completed",
    message: explanation,
    output: { question: event.text, explanation },
  };
}

async function submitVerificationRequest(event: Extract<UserFrameEvent, { readonly type: "request_verification" }>): Promise<UserFrameEventResult> {
  const status = await getProjectRunStatus(event.project_id);
  const task = event.task_id ? await getTaskStatus(event.task_id) : status.task_statuses[0];
  if (!task?.repository_status) {
    return {
      status: "failed",
      message: "Verification requests require a repository task status.",
    };
  }
  const requested = await requestRepositoryVerification({
    project_id: task.project_id,
    task_run_id: task.task_run_id,
    repo_root: task.repository_status.repo_root,
    workspace_id: task.repository_status.workspace_id,
    command_id: event.command_id,
  });
  await recordTaskFrameObservation(task, "Verification requested.", {
    command_id: event.command_id,
    verification_run_id: requested.verification_run_id,
    hatchet_run_id: requested.hatchet_run_id,
  });
  return {
    status: "submitted",
    message: `Verification submitted: ${event.command_id}`,
    project_id: task.project_id,
    task_run_id: task.task_run_id,
    hatchet_run_id: requested.hatchet_run_id,
  };
}

async function recordTaskFrameObservation(task: TaskStatusSnapshot, summary: string, output: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const item = observation({
    status: "recorded",
    summary,
    now,
    task_id: task.task_run_id,
    output,
  });
  await getStateStore().recordTaskStatus({
    ...task,
    observations: [...task.observations, item],
    ...(task.repository_status ? {
      repository_status: {
        ...task.repository_status,
        observations: [...task.repository_status.observations, item],
      },
    } : {}),
    updated_at: now,
  });
}

function approvalLine(task: TaskStatusSnapshot | undefined): string {
  const request = task?.result?.approval_request ?? task?.repository_status?.approval_request;
  if (!request) return "";
  return `Approval is required for ${request.requested_capability} at ${request.requested_risk_level} risk.`;
}

function errorLine(task: TaskStatusSnapshot | undefined): string {
  if (!task?.errors.length) return "";
  const latest = task.errors[task.errors.length - 1] ?? structuredError({
    code: "YIELDED",
    message: "No error detail was available.",
    now: new Date().toISOString(),
  });
  return `Latest error: ${latest.code} ${latest.message}`;
}

export interface RuntimeHealth {
  readonly profile: string;
  readonly api: "local" | "up" | "down" | "unknown";
  readonly worker: "up" | "unknown";
  readonly hatchet: "up" | "unknown";
  readonly packs: number;
  readonly model: "configured" | "not_configured";
  readonly remote_auth?: "configured" | "missing";
  readonly secret_provider?: string;
}

export async function getRuntimeHealth(input: { readonly api_url?: string; readonly project_id?: string; readonly worker_url?: string } = {}): Promise<RuntimeHealth> {
  const api = input.api_url ? await probeHttp(input.api_url) : "local";
  let hatchet: RuntimeHealth["hatchet"] = "unknown";
  let worker: RuntimeHealth["worker"] = "unknown";
  const workerUrl = input.worker_url ?? process.env.OPEN_LAGRANGE_WORKER_HEALTH_URL;
  if (workerUrl) worker = await probeHttp(workerUrl) === "up" ? "up" : "unknown";
  if (input.project_id) {
    const status = await getProjectRunStatus(input.project_id);
    hatchet = status.hatchet_status ? "up" : "unknown";
    if (!workerUrl) worker = status.task_statuses.length > 0 ? "up" : "unknown";
  }
  return {
    profile: process.env.OPEN_LAGRANGE_PROFILE ?? "local",
    api,
    worker,
    hatchet,
    packs: packRegistry.listPacks().length,
    model: process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY ? "configured" : "not_configured",
    remote_auth: "missing",
    secret_provider: "env",
  };
}

export function listRegisteredPacks(): readonly string[] {
  return packRegistry.listPacks().map((pack) => pack.manifest.pack_id);
}

async function probeHttp(url: string): Promise<RuntimeHealth["api"]> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok ? "up" : "down";
  } catch {
    return "down";
  }
}
