import { approveTask, createMockDelegationContext, DEFAULT_EXECUTION_BOUNDS, deterministicProjectId, deterministicRepositoryTaskRunId, getProjectStatus, getRuntimeHealth, getTaskStatus, listRegisteredPacks, rejectTask, requestArtifact, submitProject, submitRepositoryTask, submitUserFrameEvent, UserFrameEvent } from "@open-lagrange/core/interface";
import { z } from "zod";
import { SubmitJobPayload } from "../jobs/schema";
import { SubmitRepositoryJobPayload } from "../repository/jobs/schema";

const ProjectPayload = SubmitJobPayload.extend({
  kind: z.literal("project").optional(),
}).or(SubmitRepositoryJobPayload.extend({
  kind: z.literal("repository"),
}));

export async function handleRuntimeStatus(): Promise<unknown> {
  const health = await getRuntimeHealth();
  return {
    profileName: health.profile,
    mode: process.env.OPEN_LAGRANGE_RUNTIME_MODE ?? "local",
    api: { name: "api", state: "running", url: process.env.OPEN_LAGRANGE_API_URL ?? "http://localhost:4317" },
    hatchet: { name: "hatchet", state: health.hatchet === "up" ? "running" : "unknown" },
    worker: { name: "worker", state: health.worker === "up" ? "running" : "unknown" },
    registeredPacks: listRegisteredPacks(),
    modelProvider: { name: "model", state: health.model === "configured" ? "running" : "not_configured" },
  };
}

export function handleRuntimePacks(): unknown {
  return {
    packs: listRegisteredPacks(),
  };
}

export function handleRuntimeVersion(): unknown {
  return {
    name: "open-lagrange",
    version: process.env.npm_package_version ?? "0.1.0",
  };
}

export async function handleSubmitProject(raw: unknown): Promise<unknown> {
  const payload = ProjectPayload.parse(raw);
  if ("kind" in payload && payload.kind === "repository") {
    const project_id = deterministicProjectId({
      goal: payload.goal,
      workspace_id: payload.workspace_id ?? "workspace-local",
      principal_id: "human-local",
      delegate_id: "open-lagrange-api",
    });
    const task_run_id = deterministicRepositoryTaskRunId({ project_id, repo_root: payload.repo_root, goal: payload.goal });
    const delegation_context = createMockDelegationContext({
      goal: payload.goal,
      project_id,
      delegate_id: "open-lagrange-api",
      allowed_scopes: ["project:read", "project:summarize", "project:write", "repository:read", "repository:write", "repository:verify"],
      ...(payload.workspace_id ? { workspace_id: payload.workspace_id } : {}),
    });
    return submitRepositoryTask({
      goal: payload.goal,
      repo_root: payload.repo_root,
      task_run_id,
      project_id,
      dry_run: payload.dry_run && !payload.apply,
      apply: payload.apply,
      require_approval: payload.require_approval,
      ...(payload.workspace_id ? { workspace_id: payload.workspace_id } : {}),
      delegation_context: {
        ...delegation_context,
        allowed_capabilities: ["repo.list_files", "repo.read_file", "repo.search_text", "repo.propose_patch", "repo.apply_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
        max_risk_level: "external_side_effect",
        task_run_id,
      },
      verification_command_ids: ["npm_run_typecheck"],
    });
  }
  const delegation_context = createMockDelegationContext({
    goal: payload.goal,
    delegate_id: "open-lagrange-api",
    ...(payload.workspace_id ? { workspace_id: payload.workspace_id } : {}),
    ...(payload.project_id ? { project_id: payload.project_id } : {}),
    ...(payload.allowed_scopes ? { allowed_scopes: payload.allowed_scopes } : {}),
  });
  return submitProject({
    goal: payload.goal,
    delegation_context,
    bounds: DEFAULT_EXECUTION_BOUNDS,
    ...(payload.project_id ? { project_id: payload.project_id } : {}),
  });
}

export function handleProjectStatus(projectId: string): Promise<unknown> {
  return getProjectStatus(projectId);
}

export function handleTaskStatus(taskId: string): Promise<unknown> {
  return getTaskStatus(taskId);
}

export function handleApprove(taskId: string, raw: unknown): Promise<unknown> {
  const payload = z.object({ approved_by: z.string().min(1), reason: z.string().min(1) }).strict().parse(raw);
  return approveTask({ task_id: taskId, decided_by: payload.approved_by, reason: payload.reason });
}

export function handleReject(taskId: string, raw: unknown): Promise<unknown> {
  const payload = z.object({ rejected_by: z.string().min(1), reason: z.string().min(1) }).strict().parse(raw);
  return rejectTask({ task_id: taskId, decided_by: payload.rejected_by, reason: payload.reason });
}

export function handleEvent(raw: unknown): Promise<unknown> {
  return submitUserFrameEvent(UserFrameEvent.parse(raw));
}

export function handleArtifact(artifactId: string, request: Request): Promise<unknown> {
  const url = new URL(request.url);
  return requestArtifact({
    project_id: url.searchParams.get("project_id") ?? artifactId,
    ...(url.searchParams.get("task_id") ? { task_id: String(url.searchParams.get("task_id")) } : {}),
    artifact_type: artifactType(url.searchParams.get("type") ?? artifactId),
  });
}

function artifactType(value: string): "diff" | "review" | "verification" | "plan" | "artifact_json" {
  if (value === "diff" || value === "review" || value === "verification" || value === "plan" || value === "artifact_json") return value;
  return "artifact_json";
}
