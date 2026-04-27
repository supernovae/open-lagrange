import { getHatchetClient } from "./client.js";
import { toHatchetJsonObject } from "./json.js";
import { deterministicContinuationRunId, deterministicProjectId, deterministicProjectRunId } from "../ids/deterministic-ids.js";
import { observation, structuredError } from "../reconciliation/records.js";
import { ApprovalDecision, ProjectReconcilerInput, WorkflowStatusSnapshot, type ApprovalDecision as ApprovalDecisionType, type ProjectReconcilerInput as ProjectReconcilerInputType, type ProjectReconciliationResult, type WorkflowStatusSnapshot as WorkflowStatusSnapshotType } from "../schemas/reconciliation.js";
import { RepositoryTaskInput, type RepositoryTaskInput as RepositoryTaskInputType } from "../schemas/repository.js";
import { type TaskStatusSnapshot } from "../status/status-store.js";
import { getStateStore } from "../storage/state-store.js";

export interface SubmittedProjectRun {
  readonly project_id: string;
  readonly project_run_id: string;
  readonly hatchet_run_id: string;
}

export interface SubmittedRepositoryTaskRun {
  readonly project_id: string;
  readonly task_run_id: string;
  readonly hatchet_run_id: string;
}

export interface ProjectRunStatus {
  readonly project_id?: string | undefined;
  readonly project_run_id: string;
  readonly hatchet_run_id?: string | undefined;
  readonly hatchet_status?: string | undefined;
  readonly status?: WorkflowStatusSnapshotType | undefined;
  readonly task_statuses: readonly TaskStatusSnapshot[];
  readonly output?: ProjectReconciliationResult;
}

export interface ApprovalActionInput {
  readonly task_id: string;
  readonly decided_by: string;
  readonly reason: string;
}

export interface ApprovalActionResult {
  readonly decision?: ApprovalDecisionType;
  readonly continuation_run_id?: string;
  readonly task_status?: TaskStatusSnapshot | undefined;
}

export async function submitProjectRun(input: ProjectReconcilerInputType): Promise<SubmittedProjectRun> {
  const parsed = ProjectReconcilerInput.parse(input);
  const project_id = parsed.project_id ?? deterministicProjectId({
    goal: parsed.goal,
    workspace_id: parsed.delegation_context.workspace_id,
    principal_id: parsed.delegation_context.principal_id,
    delegate_id: parsed.delegation_context.delegate_id,
  });
  const project_run_id = deterministicProjectRunId(project_id);
  const { projectReconciler } = await import("../workflows/project-reconciler.js");
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

export const submitProject = submitProjectRun;

export async function submitRepositoryTask(input: RepositoryTaskInputType): Promise<SubmittedRepositoryTaskRun> {
  const parsed = RepositoryTaskInput.parse(input);
  const { repositoryTaskReconciler } = await import("../workflows/repository-task-reconciler.js");
  const ref = await repositoryTaskReconciler.runNoWait(toHatchetJsonObject(parsed), {
    additionalMetadata: {
      project_id: parsed.project_id,
      task_run_id: parsed.task_run_id,
      trace_id: parsed.delegation_context.trace_id,
      repo_root: parsed.repo_root,
    },
  });
  return {
    project_id: parsed.project_id,
    task_run_id: parsed.task_run_id,
    hatchet_run_id: await ref.runId,
  };
}

export async function getProjectRunStatus(projectIdOrRunId: string): Promise<ProjectRunStatus> {
  const store = getStateStore();
  const status = await store.getProjectStatus(projectIdOrRunId);
  const project_run_id = status?.project_run_id ?? projectIdOrRunId;
  const task_statuses = status ? await store.listTaskStatusesForProject(status.project_id) : [];
  const result: ProjectRunStatus = {
    project_id: status?.project_id,
    project_run_id,
    status,
    task_statuses,
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

export const getProjectStatus = getProjectRunStatus;

export async function getTaskStatus(taskIdOrRunId: string): Promise<TaskStatusSnapshot | undefined> {
  const store = getStateStore();
  return (await store.getTaskStatus(taskIdOrRunId)) ?? store.getTaskStatusByTaskId(taskIdOrRunId);
}

export async function approveTask(input: ApprovalActionInput): Promise<ApprovalActionResult> {
  const store = getStateStore();
  const existing = await store.getApprovalDecisionForTask(input.task_id);
  if (!existing) return {};
  const decision = ApprovalDecision.parse(await store.approveRequest(
    existing.approval_request_id,
    input.decided_by,
    new Date().toISOString(),
    input.reason,
  ));
  const envelope = await store.getApprovalContinuationEnvelope(decision.approval_request_id);
  if (envelope?.kind === "repository_patch") {
    const continuation = await continueApprovedRepositoryTask({
      approval_request_id: decision.approval_request_id,
      task_run_id: envelope.task_run_id,
    });
    return {
      decision,
      continuation_run_id: continuation.continuation_run_id,
      task_status: await getTaskStatus(input.task_id),
    };
  }
  const context = await store.getContinuationContext(decision.approval_request_id);
  if (!context) {
    return {
      decision,
      task_status: await getTaskStatus(input.task_id),
    };
  }
  const continuation = await continueApprovedTask({
    approval_request_id: decision.approval_request_id,
    task_run_id: context.task_run_id,
  });
  return {
    decision,
    continuation_run_id: continuation.continuation_run_id,
    task_status: await getTaskStatus(input.task_id),
  };
}

export async function rejectTask(input: ApprovalActionInput): Promise<ApprovalActionResult> {
  const store = getStateStore();
  const existing = await store.getApprovalDecisionForTask(input.task_id);
  if (!existing) return {};
  const decision = ApprovalDecision.parse(await store.rejectRequest(
    existing.approval_request_id,
    input.decided_by,
    new Date().toISOString(),
    input.reason,
  ));
  const context = await store.getContinuationContext(decision.approval_request_id);
  const envelope = await store.getApprovalContinuationEnvelope(decision.approval_request_id);
  if (envelope?.kind === "repository_patch") {
    const now = decision.decided_at ?? new Date().toISOString();
    const current = await getTaskStatus(input.task_id);
    const item = structuredError({
      code: "YIELDED",
      message: decision.reason ?? "Approval was rejected",
      now,
      task_id: "repository-task",
      intent_id: decision.intent_id,
    });
    await store.recordTaskStatus({
      project_id: envelope.project_id,
      task_id: "repository-task",
      task_run_id: envelope.task_run_id,
      status: "yielded",
      observations: [observation({
        status: "skipped",
        summary: "Repository approval was rejected.",
        now,
        task_id: "repository-task",
        intent_id: decision.intent_id,
      })],
      errors: [item],
      final_message: "Repository task yielded after rejection.",
      ...(current?.repository_status ? {
        repository_status: {
          ...current.repository_status,
          current_phase: "yielded",
          errors: [...current.repository_status.errors, item],
          observations: [...current.repository_status.observations, observation({
            status: "skipped",
            summary: "Repository approval was rejected.",
            now,
            task_id: "repository-task",
            intent_id: decision.intent_id,
          })],
        },
      } : {}),
      updated_at: now,
    });
    return { decision, task_status: await getTaskStatus(input.task_id) };
  }
  if (context) {
    const now = decision.decided_at ?? new Date().toISOString();
    const item = structuredError({
      code: "YIELDED",
      message: decision.reason ?? "Approval was rejected",
      now,
      task_id: context.scoped_task.task_id,
      intent_id: context.intent.intent_id,
    });
    await store.recordTaskStatus({
      project_id: context.parent_project_id,
      task_id: context.scoped_task.task_id,
      task_run_id: context.task_run_id,
      status: "yielded",
      observations: [observation({
        status: "skipped",
        summary: "Approval was rejected.",
        now,
        task_id: context.scoped_task.task_id,
        intent_id: context.intent.intent_id,
      })],
      errors: [item],
      final_message: "Task yielded after rejection.",
      updated_at: now,
    });
  }
  const status = await getTaskStatus(input.task_id);
  return { decision, task_status: status };
}

export async function continueApprovedTask(input: {
  readonly approval_request_id: string;
  readonly task_run_id: string;
}): Promise<{ readonly continuation_run_id: string }> {
  const continuation_run_id = deterministicContinuationRunId(input);
  const { taskContinuation } = await import("../workflows/task-continuation.js");
  const ref = await taskContinuation.runNoWait(toHatchetJsonObject(input), {
    additionalMetadata: {
      continuation_run_id,
      approval_request_id: input.approval_request_id,
      task_run_id: input.task_run_id,
    },
  });
  return { continuation_run_id: await ref.runId };
}

export async function continueApprovedRepositoryTask(input: {
  readonly approval_request_id: string;
  readonly task_run_id: string;
}): Promise<{ readonly continuation_run_id: string }> {
  const continuation_run_id = deterministicContinuationRunId(input);
  const { repositoryTaskContinuation } = await import("../workflows/repository-task-continuation.js");
  const ref = await repositoryTaskContinuation.runNoWait(toHatchetJsonObject(input), {
    additionalMetadata: {
      continuation_run_id,
      approval_request_id: input.approval_request_id,
      task_run_id: input.task_run_id,
      continuation_kind: "repository_patch",
    },
  });
  return { continuation_run_id: await ref.runId };
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
