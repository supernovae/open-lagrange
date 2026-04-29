import type { ProjectRunStatus, RuntimeHealth } from "@open-lagrange/core/interface";
import type { TaskStatusSnapshot } from "@open-lagrange/core/interface";
import type { SuggestedFlow } from "@open-lagrange/core/interface";
import type { ApprovalRequestSummary, ArtifactSummary, ChangedFileSummary, ConversationTurn, InputMode, PaneId, PlanViewSummary, ReconciliationTimelineItem, SkillViewSummary, TuiViewModel, VerificationResultSummary } from "./types.js";

const fallbackHealth: RuntimeHealth = {
  profile: "local",
  api: "local",
  worker: "unknown",
  hatchet: "unknown",
  packs: 0,
  model: "not_configured",
  remote_auth: "missing",
  secret_provider: "env",
};

export function buildViewModel(input: {
  readonly project?: ProjectRunStatus;
  readonly selectedPane: PaneId;
  readonly inputMode: InputMode;
  readonly isLoading: boolean;
  readonly health?: RuntimeHealth;
  readonly lastError?: string;
  readonly conversation?: readonly ConversationTurn[];
  readonly pendingFlow?: SuggestedFlow;
}): TuiViewModel {
  const activeTask = input.project?.task_statuses[0];
  const approvals = approvalSummaries(input.project?.task_statuses ?? []);
  const artifacts = artifactSummaries(input.project, activeTask);
  const plan = planSummary(input.project);
  const skill = skillSummary(input.project);
  return {
    ...(input.project ? { project: input.project } : {}),
    ...(activeTask ? { activeTask } : {}),
    conversation: input.conversation ?? initialConversation(input.project),
    timeline: timeline(input.project),
    approvals,
    artifacts,
    changedFiles: changedFiles(activeTask),
    verificationResults: verificationResults(activeTask),
    ...(plan ? { plan } : {}),
    ...(skill ? { skill } : {}),
    ...(input.pendingFlow ? { pendingFlow: input.pendingFlow } : {}),
    selectedPane: input.selectedPane,
    inputMode: input.inputMode,
    isLoading: input.isLoading,
    health: input.health ?? fallbackHealth,
    ...(input.lastError ? { lastError: input.lastError } : {}),
  };
}

function skillSummary(project: ProjectRunStatus | undefined): SkillViewSummary | undefined {
  const skill = (project?.output as unknown as { readonly skill?: unknown } | undefined)?.skill;
  if (!skill || typeof skill !== "object") return undefined;
  const value = skill as Record<string, unknown>;
  const frame = typeof value.frame === "object" && value.frame ? value.frame as Record<string, unknown> : value;
  const decision = typeof value.decision === "object" && value.decision ? value.decision as Record<string, unknown> : {};
  const workflow = typeof value.workflow_skill === "object" && value.workflow_skill ? value.workflow_skill as Record<string, unknown> : {};
  return {
    skill_id: stringField(frame.skill_id) ?? stringField(workflow.skill_id) ?? "unknown",
    interpreted_goal: stringField(frame.interpreted_goal) ?? stringField(workflow.description) ?? "unknown",
    existing_pack_matches: arrayStrings(decision.capability_matches).length > 0 ? arrayStrings(decision.capability_matches) : arrayStrings(frame.existing_pack_matches),
    missing_capabilities: arrayStrings(decision.missing_capabilities).length > 0 ? arrayStrings(decision.missing_capabilities) : arrayStrings(frame.missing_capabilities),
    required_scopes: arrayStrings(frame.required_scopes).length > 0 ? arrayStrings(frame.required_scopes) : arrayStrings(workflow.required_scopes),
    required_secret_refs: arrayStrings(frame.required_secrets_as_refs).length > 0 ? arrayStrings(frame.required_secrets_as_refs) : arrayStrings(workflow.required_secret_refs),
    approval_requirements: arrayStrings(frame.approval_requirements),
    ...(typeof workflow.planfile_template === "object" && workflow.planfile_template ? { planfile_template: JSON.stringify(workflow.planfile_template, null, 2) } : {}),
  };
}

function planSummary(project: ProjectRunStatus | undefined): PlanViewSummary | undefined {
  const plan = project?.output?.plan;
  if (!plan) return undefined;
  const active = plan.tasks.find((task) => project?.task_statuses.some((status) => status.task_id === task.task_id && status.status === "running")) ?? plan.tasks[0];
  const worktree_path = worktreePath(project);
  return {
    plan_id: plan.plan_id,
    status: project?.status?.status ?? "unknown",
    ...(active ? { current_node: active.task_id } : {}),
    ...(worktree_path ? { worktree_path } : {}),
    dag_lines: plan.tasks.map((task, index) => `${index + 1}. ${task.task_id}: ${task.title}`),
    approval_requirements: approvalSummaries(project?.task_statuses ?? []).map((approval) => `${approval.task_id}: ${approval.requested_risk_level}`),
    changed_files: changedFiles(project?.task_statuses[0]).map((file) => file.path),
    patch_artifacts: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "diff").map((artifact) => artifact.artifact_id),
    verification_reports: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "verification").map((artifact) => artifact.artifact_id),
    repair_attempts: repairAttempts(project),
    artifact_refs: artifactSummaries(project, project?.task_statuses[0]).map((artifact) => artifact.artifact_id),
    validation_errors: project?.status?.errors.map((error) => error.message) ?? [],
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
  const indexed = (project?.output as unknown as { readonly artifacts?: unknown } | undefined)?.artifacts;
  if (Array.isArray(indexed)) {
    for (const artifact of indexed) {
      if (!artifact || typeof artifact !== "object") continue;
      const item = artifact as Record<string, unknown>;
      items.push({
        artifact_id: typeof item.artifact_id === "string" ? item.artifact_id : "artifact",
        artifact_type: artifactType(typeof item.kind === "string" ? item.kind : "artifact_json"),
        title: typeof item.title === "string" ? item.title : "Artifact",
        value: item,
      });
    }
  }
  if (project?.output?.plan) items.push({ artifact_id: "plan", artifact_type: "plan", title: "Execution plan", value: project.output.plan });
  if (task?.repository_status?.diff_text || task?.repository_status?.diff_summary) items.push({ artifact_id: "diff", artifact_type: "diff", title: "Diff", value: task.repository_status.diff_text ?? task.repository_status.diff_summary });
  if (task?.repository_status?.verification_results) items.push({ artifact_id: "verification", artifact_type: "verification", title: "Verification", value: task.repository_status.verification_results });
  if (task?.repository_status?.review_report) items.push({ artifact_id: "review", artifact_type: "review", title: "Review report", value: task.repository_status.review_report });
  if (task?.result) items.push({ artifact_id: "artifact_json", artifact_type: "artifact_json", title: "Task result JSON", value: task.result });
  return items;
}

function artifactType(value: string): ArtifactSummary["artifact_type"] {
  if (value === "planfile") return "plan";
  if (value === "verification_report") return "verification";
  if (value === "review_report") return "review";
  if (value === "skill_frame" || value === "workflow_skill" || value === "pack_build_plan" || value === "generated_pack" || value === "pack_manifest" || value === "pack_validation_report" || value === "pack_test_report" || value === "pack_install_report" || value === "patch_plan" || value === "patch_artifact" || value === "research_brief" || value === "approval_request" || value === "execution_timeline" || value === "raw_log") return value;
  return "artifact_json";
}

function worktreePath(project: ProjectRunStatus | undefined): string | undefined {
  const value = project?.status?.observations
    .map((observation) => observation.output)
    .find((output) => output && typeof output === "object" && "worktree_path" in output);
  return typeof (value as { readonly worktree_path?: unknown } | undefined)?.worktree_path === "string"
    ? (value as { readonly worktree_path: string }).worktree_path
    : undefined;
}

function repairAttempts(project: ProjectRunStatus | undefined): readonly string[] {
  return project?.status?.observations
    .filter((observation) => observation.summary.toLowerCase().includes("repair"))
    .map((observation) => observation.summary) ?? [];
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

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function arrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string"
    ? item
    : item && typeof item === "object" && "ref_id" in item
      ? String((item as { readonly ref_id: unknown }).ref_id)
      : JSON.stringify(item)).filter(Boolean);
}
