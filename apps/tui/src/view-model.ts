import type { ProjectRunStatus, RuntimeHealth } from "@open-lagrange/core/interface";
import type { TaskStatusSnapshot } from "@open-lagrange/core/interface";
import type { ApprovalRequestSummary, ArtifactSummary, ChangedFileSummary, ConversationTurn, InputMode, PaneId, ReconciliationTimelineItem, TuiViewModel, VerificationResultSummary } from "./types.js";

const fallbackHealth: RuntimeHealth = {
  profile: "local",
  api: "local",
  worker: "unknown",
  hatchet: "unknown",
  packs: 0,
  model: "not_configured",
};

export function buildViewModel(input: {
  readonly project?: ProjectRunStatus;
  readonly selectedPane: PaneId;
  readonly inputMode: InputMode;
  readonly isLoading: boolean;
  readonly health?: RuntimeHealth;
  readonly lastError?: string;
  readonly conversation?: readonly ConversationTurn[];
}): TuiViewModel {
  const activeTask = input.project?.task_statuses[0];
  const approvals = approvalSummaries(input.project?.task_statuses ?? []);
  const artifacts = artifactSummaries(input.project, activeTask);
  return {
    ...(input.project ? { project: input.project } : {}),
    ...(activeTask ? { activeTask } : {}),
    conversation: input.conversation ?? initialConversation(input.project),
    timeline: timeline(input.project),
    approvals,
    artifacts,
    changedFiles: changedFiles(activeTask),
    verificationResults: verificationResults(activeTask),
    selectedPane: input.selectedPane,
    inputMode: input.inputMode,
    isLoading: input.isLoading,
    health: input.health ?? fallbackHealth,
    ...(input.lastError ? { lastError: input.lastError } : {}),
  };
}

export function sortTimeline(items: readonly ReconciliationTimelineItem[]): readonly ReconciliationTimelineItem[] {
  return [...items].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function initialConversation(project: ProjectRunStatus | undefined): readonly ConversationTurn[] {
  if (!project?.status) return [{ turn_id: "turn-empty", role: "system", text: "Enter a goal to begin reconciliation.", created_at: new Date(0).toISOString() }];
  return [{
    turn_id: `turn-${project.status.project_id}`,
    role: "system",
    text: project.status.final_message ?? `Project ${project.status.status}`,
    created_at: project.status.updated_at,
    project_id: project.status.project_id,
  }];
}

function timeline(project: ProjectRunStatus | undefined): readonly ReconciliationTimelineItem[] {
  if (!project?.status) return [];
  const items: ReconciliationTimelineItem[] = [{
    event_id: `${project.status.project_id}:project:${project.status.updated_at}`,
    timestamp: project.status.updated_at,
    phase: project.status.status,
    title: "Project status",
    summary: project.status.final_message ?? project.status.status,
    project_id: project.status.project_id,
      severity: severity(project.status.status) ?? "info",
  }];
  for (const observation of project.status.observations) {
    items.push({
      event_id: observation.observation_id,
      timestamp: observation.observed_at,
      phase: observation.status,
      title: "Observation",
      summary: observation.summary,
      project_id: project.status.project_id,
      severity: observation.status === "error" ? "error" : "info",
      ...(observation.output && typeof observation.output === "object" ? { metadata: observation.output as Record<string, unknown> } : {}),
    });
  }
  for (const task of project.task_statuses) {
    items.push({
      event_id: `${task.task_run_id}:status:${task.updated_at}`,
      timestamp: task.updated_at,
      phase: task.repository_status?.current_phase ?? task.status,
      title: task.task_id,
      summary: task.final_message ?? task.status,
      project_id: task.project_id,
      task_id: task.task_run_id,
      severity: severity(task.status) ?? "info",
    });
    for (const error of task.errors) {
      items.push({
        event_id: `${task.task_run_id}:error:${indexKey(error.message, error.observed_at)}`,
        timestamp: error.observed_at,
        phase: error.code,
        title: "Error",
        summary: error.message,
        project_id: task.project_id,
        task_id: task.task_run_id,
        severity: "error",
      });
    }
  }
  return sortTimeline(items);
}

function approvalSummaries(tasks: readonly TaskStatusSnapshot[]): readonly ApprovalRequestSummary[] {
  return tasks.flatMap((task) => {
    const request = task.result?.approval_request ?? task.repository_status?.approval_request;
    if (!request) return [];
    return [{
      approval_request_id: request.approval_request_id,
      task_id: task.task_run_id,
      requested_capability: request.requested_capability,
      requested_risk_level: request.requested_risk_level,
      prompt: request.prompt,
    }];
  });
}

function artifactSummaries(project: ProjectRunStatus | undefined, task: TaskStatusSnapshot | undefined): readonly ArtifactSummary[] {
  const items: ArtifactSummary[] = [];
  if (project?.output?.plan) items.push({ artifact_id: "plan", artifact_type: "plan", title: "Execution plan", value: project.output.plan });
  if (task?.repository_status?.diff_text || task?.repository_status?.diff_summary) items.push({ artifact_id: "diff", artifact_type: "diff", title: "Diff", value: task.repository_status.diff_text ?? task.repository_status.diff_summary });
  if (task?.repository_status?.verification_results) items.push({ artifact_id: "verification", artifact_type: "verification", title: "Verification", value: task.repository_status.verification_results });
  if (task?.repository_status?.review_report) items.push({ artifact_id: "review", artifact_type: "review", title: "Review report", value: task.repository_status.review_report });
  if (task?.result) items.push({ artifact_id: "artifact_json", artifact_type: "artifact_json", title: "Task result JSON", value: task.result });
  return items;
}

function changedFiles(task: TaskStatusSnapshot | undefined): readonly ChangedFileSummary[] {
  return (task?.repository_status?.changed_files ?? task?.repository_status?.planned_files ?? []).map((path) => ({ path }));
}

function verificationResults(task: TaskStatusSnapshot | undefined): readonly VerificationResultSummary[] {
  return (task?.repository_status?.verification_results ?? []).map((result) => ({
    command_id: result.command_id,
    command: result.command,
    exit_code: result.exit_code,
    duration_ms: result.duration_ms,
    stdout_preview: result.stdout_preview,
    stderr_preview: result.stderr_preview,
    truncated: result.truncated,
  }));
}

function severity(status: string): ReconciliationTimelineItem["severity"] {
  if (status === "completed") return "success";
  if (status === "failed" || status === "completed_with_errors") return "error";
  if (status === "requires_approval" || status === "yielded") return "warning";
  return "info";
}

function indexKey(message: string, observedAt: string): string {
  return `${observedAt}:${message}`.replace(/\W+/g, "-").slice(0, 80);
}
