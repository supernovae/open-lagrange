import { getHatchetClient } from "./client.js";
import { toHatchetJsonObject } from "./json.js";
import { deterministicProjectId, deterministicProjectRunId } from "../ids/deterministic-ids.js";
import { inMemoryStatusStore } from "../status/status-store.js";
import { ProjectReconcilerInput, WorkflowStatusSnapshot, type ProjectReconcilerInput as ProjectReconcilerInputType, type ProjectReconciliationResult, type WorkflowStatusSnapshot as WorkflowStatusSnapshotType } from "../schemas/reconciliation.js";
import { projectReconciler } from "../workflows/project-reconciler.js";

export interface SubmittedProjectRun {
  readonly project_id: string;
  readonly project_run_id: string;
  readonly hatchet_run_id: string;
}

export interface ProjectRunStatus {
  readonly project_id?: string | undefined;
  readonly project_run_id: string;
  readonly hatchet_run_id?: string | undefined;
  readonly hatchet_status?: string | undefined;
  readonly status?: WorkflowStatusSnapshotType | undefined;
  readonly output?: ProjectReconciliationResult;
}

export async function submitProjectRun(input: ProjectReconcilerInputType): Promise<SubmittedProjectRun> {
  const parsed = ProjectReconcilerInput.parse(input);
  const project_id = deterministicProjectId({
    goal: parsed.goal,
    workspace_id: parsed.delegation_context.workspace_id,
    principal_id: parsed.delegation_context.principal_id,
    delegate_id: parsed.delegation_context.delegate_id,
  });
  const project_run_id = deterministicProjectRunId(project_id);
  const ref = await projectReconciler.runNoWait(toHatchetJsonObject({
    ...parsed,
    delegation_context: {
      ...parsed.delegation_context,
      project_id,
      parent_run_id: project_run_id,
    },
  }), {
    additionalMetadata: {
      project_id,
      project_run_id,
      trace_id: parsed.delegation_context.trace_id,
    },
  });
  return {
    project_id,
    project_run_id,
    hatchet_run_id: await ref.runId,
  };
}

export async function getProjectRunStatus(projectIdOrRunId: string): Promise<ProjectRunStatus> {
  const status = await inMemoryStatusStore.getProjectStatus(projectIdOrRunId);
  const project_run_id = status?.project_run_id ?? projectIdOrRunId;
  const result: ProjectRunStatus = {
    project_id: status?.project_id,
    project_run_id,
    status,
  };
  try {
    const runRef = getHatchetClient().runRef<ProjectReconciliationResult>(projectIdOrRunId);
    const hatchet_run_id = await runRef.runId;
    const hatchet_status = await getHatchetClient().runs.get_status(hatchet_run_id);
    return {
      ...result,
      hatchet_run_id,
      hatchet_status,
    };
  } catch {
    return findRunByMetadata(project_run_id, result);
  }
}

export function parseStatusSnapshot(input: unknown): WorkflowStatusSnapshotType {
  return WorkflowStatusSnapshot.parse(input);
}

async function findRunByMetadata(projectRunId: string, fallback: ProjectRunStatus): Promise<ProjectRunStatus> {
  try {
    const listed = await getHatchetClient().runs.list({
      additionalMetadata: { project_run_id: projectRunId },
      onlyTasks: false,
      limit: 1,
    });
    const runId = firstRunId(listed);
    if (!runId) return fallback;
    return {
      ...fallback,
      hatchet_run_id: runId,
      hatchet_status: await getHatchetClient().runs.get_status(runId),
    };
  } catch {
    return fallback;
  }
}

function firstRunId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidates = ["rows", "data", "items", "runs"];
  for (const key of candidates) {
    const list = (value as Record<string, unknown>)[key];
    if (!Array.isArray(list)) continue;
    const first = list[0];
    if (!first || typeof first !== "object") continue;
    const record = first as Record<string, unknown>;
    const id = record.metadata ?? record.id ?? record.workflowRunId ?? record.externalId;
    if (typeof id === "string") return id;
  }
  return undefined;
}
