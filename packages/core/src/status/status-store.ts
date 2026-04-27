import { TaskReconciliationResult, WorkflowStatusSnapshot, type TaskReconciliationResult as TaskReconciliationResultType, type WorkflowStatusSnapshot as WorkflowStatusSnapshotType } from "../schemas/reconciliation.js";
import { RepositoryTaskStatus, type RepositoryTaskStatus as RepositoryTaskStatusType } from "../schemas/repository.js";
import { Observation, StructuredError, type Observation as ObservationType, type StructuredError as StructuredErrorType } from "../schemas/open-cot.js";

export interface StatusStore {
  readonly recordProjectStatus: (snapshot: WorkflowStatusSnapshotType) => Promise<WorkflowStatusSnapshotType>;
  readonly recordTaskStatus: (snapshot: TaskStatusSnapshot) => Promise<TaskStatusSnapshot>;
  readonly getProjectStatus: (projectIdOrRunId: string) => Promise<WorkflowStatusSnapshotType | undefined>;
  readonly getTaskStatus: (taskRunId: string) => Promise<TaskStatusSnapshot | undefined>;
  readonly getTaskStatusByTaskId: (taskId: string) => Promise<TaskStatusSnapshot | undefined>;
  readonly listTaskStatusesForProject: (projectId: string) => Promise<readonly TaskStatusSnapshot[]>;
  readonly appendObservation: (projectIdOrRunId: string, item: ObservationType) => Promise<void>;
  readonly appendStructuredError: (projectIdOrRunId: string, item: StructuredErrorType) => Promise<void>;
}

export interface TaskStatusSnapshot {
  readonly project_id: string;
  readonly task_id: string;
  readonly task_run_id: string;
  readonly status: WorkflowStatusSnapshotType["status"];
  readonly observations: readonly ObservationType[];
  readonly errors: readonly StructuredErrorType[];
  readonly final_message?: string;
  readonly result?: TaskReconciliationResultType;
  readonly repository_status?: RepositoryTaskStatusType;
  readonly updated_at: string;
}

const projectStatuses = new Map<string, WorkflowStatusSnapshotType>();
const taskStatuses = new Map<string, TaskStatusSnapshot>();

export const inMemoryStatusStore: StatusStore = {
  async recordProjectStatus(snapshot) {
    const parsed = WorkflowStatusSnapshot.parse(snapshot);
    projectStatuses.set(parsed.project_id, parsed);
    projectStatuses.set(parsed.project_run_id, parsed);
    return parsed;
  },
  async recordTaskStatus(snapshot) {
    const parsed = parseTaskStatus(snapshot);
    taskStatuses.set(parsed.task_run_id, parsed);
    return parsed;
  },
  async getProjectStatus(projectIdOrRunId) {
    return projectStatuses.get(projectIdOrRunId);
  },
  async getTaskStatus(taskRunId) {
    return taskStatuses.get(taskRunId);
  },
  async getTaskStatusByTaskId(taskId) {
    return [...taskStatuses.values()].find((status) => status.task_id === taskId);
  },
  async listTaskStatusesForProject(projectId) {
    return [...taskStatuses.values()].filter((status) => status.project_id === projectId);
  },
  async appendObservation(projectIdOrRunId, item) {
    const status = projectStatuses.get(projectIdOrRunId);
    if (!status) return;
    const observation = Observation.parse(item);
    await this.recordProjectStatus({
      ...status,
      observations: [...status.observations, observation],
      updated_at: observation.observed_at,
    });
  },
  async appendStructuredError(projectIdOrRunId, item) {
    const status = projectStatuses.get(projectIdOrRunId);
    if (!status) return;
    const error = StructuredError.parse(item);
    await this.recordProjectStatus({
      ...status,
      errors: [...status.errors, error],
      updated_at: error.observed_at,
    });
  },
};

export function parseTaskStatus(input: TaskStatusSnapshot): TaskStatusSnapshot {
  return {
    ...input,
    observations: input.observations.map((item) => Observation.parse(item)),
    errors: input.errors.map((item) => StructuredError.parse(item)),
    ...(input.result ? { result: TaskReconciliationResult.parse(input.result) } : {}),
    ...(input.repository_status ? { repository_status: RepositoryTaskStatus.parse(input.repository_status) } : {}),
  };
}
