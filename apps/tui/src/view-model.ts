import type { ProjectRunStatus, RuntimeHealth } from "@open-lagrange/core/interface";
import type { TaskStatusSnapshot } from "@open-lagrange/core/interface";
import type { SuggestedFlow } from "@open-lagrange/core/interface";
import type { ApprovalRequestSummary, ArtifactSummary, ChangedFileSummary, ConversationTurn, InputMode, PaneId, PlanLibraryViewSummary, PlanViewSummary, ReconciliationTimelineItem, SkillViewSummary, TuiViewModel, VerificationResultSummary } from "./types.js";

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
  readonly scrollOffset?: number;
  readonly expandedTurnId?: string;
  readonly inputMode: InputMode;
  readonly isLoading: boolean;
  readonly health?: RuntimeHealth;
  readonly lastError?: string;
  readonly conversation?: readonly ConversationTurn[];
  readonly pendingFlow?: SuggestedFlow;
  readonly run?: TuiViewModel["run"];
  readonly planLibrary?: PlanLibraryViewSummary;
  readonly runConnectionState?: TuiViewModel["runConnectionState"];
  readonly activeObject?: TuiViewModel["activeObject"];
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
    ...(input.planLibrary ? { planLibrary: input.planLibrary } : {}),
    ...(input.run ? { run: input.run } : {}),
    ...(input.runConnectionState ? { runConnectionState: input.runConnectionState } : {}),
    ...(skill ? { skill } : {}),
    ...(input.activeObject ? { activeObject: input.activeObject } : {}),
    ...(input.pendingFlow ? { pendingFlow: input.pendingFlow } : {}),
    selectedPane: input.selectedPane,
    scrollOffset: input.scrollOffset ?? 0,
    ...(input.expandedTurnId ? { expandedTurnId: input.expandedTurnId } : {}),
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
  const livePlan = livePlanExecution(project);
  if (!plan && !livePlan) return undefined;
  if (!plan && livePlan) {
    return {
      plan_id: livePlan.plan_id,
      status: livePlan.status,
      ...(livePlan.current_node ? { current_node: livePlan.current_node } : {}),
      ...(livePlan.current_capability ? { current_capability: livePlan.current_capability } : {}),
      ...(livePlan.policy_result ? { policy_result: livePlan.policy_result } : {}),
      ...(livePlan.final_markdown_artifact ? { final_markdown_artifact: livePlan.final_markdown_artifact } : {}),
      ...(livePlan.final_patch_artifact ? { final_patch_artifact: livePlan.final_patch_artifact } : {}),
      ...(livePlan.worktree_path ? { worktree_path: livePlan.worktree_path } : {}),
      dag_lines: livePlan.nodes.map((node) => `${node.node_id}: ${node.status}${node.capability ? ` (${node.capability})` : ""}`),
      approval_requirements: [],
      evidence_bundles: livePlan.evidence_bundle_ids,
      scope_expansion_requests: livePlan.scope_expansion_request_ids,
      scope_expansion_details: livePlan.scope_expansion_details,
      patch_validation_reports: livePlan.patch_validation_report_ids,
      changed_files: livePlan.changed_files,
      patch_artifacts: livePlan.patch_artifact_ids,
      verification_reports: livePlan.verification_report_ids,
      repair_attempts: livePlan.repair_attempt_ids,
      model_usage_lines: livePlan.model_usage_lines,
      model_call_artifact_refs: livePlan.model_call_artifact_refs,
      artifact_refs: livePlan.artifact_refs,
      warnings: livePlan.warnings,
      validation_errors: livePlan.errors,
    };
  }
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
    evidence_bundles: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "evidence_bundle").map((artifact) => artifact.artifact_id),
    scope_expansion_requests: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "scope_expansion_request").map((artifact) => artifact.artifact_id),
    scope_expansion_details: [],
    patch_validation_reports: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "patch_validation_report").map((artifact) => artifact.artifact_id),
    changed_files: changedFiles(project?.task_statuses[0]).map((file) => file.path),
    patch_artifacts: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "diff").map((artifact) => artifact.artifact_id),
    verification_reports: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "verification").map((artifact) => artifact.artifact_id),
    repair_attempts: repairAttempts(project),
    model_usage_lines: modelUsageLines((project?.output as unknown as Record<string, unknown> | undefined)?.model_usage),
    model_call_artifact_refs: artifactSummaries(project, project?.task_statuses[0]).filter((artifact) => artifact.artifact_type === "model_call").map((artifact) => artifact.artifact_id),
    artifact_refs: artifactSummaries(project, project?.task_statuses[0]).map((artifact) => artifact.artifact_id),
    warnings: [],
    validation_errors: project?.status?.errors.map((error) => error.message) ?? [],
  };
}

function livePlanExecution(project: ProjectRunStatus | undefined): {
  readonly plan_id: string;
  readonly status: string;
  readonly current_node?: string;
  readonly current_capability?: string;
  readonly policy_result?: string;
  readonly final_markdown_artifact?: string;
  readonly final_patch_artifact?: string;
  readonly worktree_path?: string;
  readonly nodes: readonly { readonly node_id: string; readonly status: string; readonly capability?: string }[];
  readonly evidence_bundle_ids: readonly string[];
  readonly scope_expansion_request_ids: readonly string[];
  readonly scope_expansion_details: readonly string[];
  readonly patch_validation_report_ids: readonly string[];
  readonly changed_files: readonly string[];
  readonly patch_artifact_ids: readonly string[];
  readonly verification_report_ids: readonly string[];
  readonly repair_attempt_ids: readonly string[];
  readonly model_usage_lines: readonly string[];
  readonly model_call_artifact_refs: readonly string[];
  readonly artifact_refs: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
} | undefined {
  const output = project?.output as unknown as { readonly plan_execution?: unknown; readonly repository_plan_status?: unknown } | undefined;
  const value = output?.plan_execution ?? output?.repository_plan_status;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const nodes = Array.isArray(record.nodes) ? record.nodes.map((node) => {
    const item = node && typeof node === "object" ? node as Record<string, unknown> : {};
    const capability = stringField(item.capability);
    return {
      node_id: stringField(item.node_id) ?? "node",
      status: stringField(item.status) ?? "unknown",
      ...(capability ? { capability } : {}),
    };
  }) : [];
  const currentNode = stringField(record.current_node);
  const currentCapability = stringField(record.current_capability);
  const policyResult = stringField(record.policy_result);
  const finalMarkdownArtifact = stringField(record.final_markdown_artifact);
  const finalPatchArtifact = stringField(record.final_patch_artifact_id) ?? stringField(record.final_patch_artifact);
  const worktreePath = typeof record.worktree_session === "object" && record.worktree_session
    ? stringField((record.worktree_session as Record<string, unknown>).worktree_path)
    : stringField(record.worktree_path);
  return {
    plan_id: stringField(record.plan_id) ?? "unknown",
    status: stringField(record.status) ?? "unknown",
    ...(currentNode ? { current_node: currentNode } : {}),
    ...(currentCapability ? { current_capability: currentCapability } : {}),
    ...(policyResult ? { policy_result: policyResult } : {}),
    ...(finalMarkdownArtifact ? { final_markdown_artifact: finalMarkdownArtifact } : {}),
    ...(finalPatchArtifact ? { final_patch_artifact: finalPatchArtifact } : {}),
    ...(worktreePath ? { worktree_path: worktreePath } : {}),
    nodes,
    evidence_bundle_ids: arrayStrings(record.evidence_bundle_ids),
    scope_expansion_request_ids: arrayStrings(record.scope_expansion_request_ids),
    scope_expansion_details: scopeExpansionDetails(record.scope_expansion_requests),
    patch_validation_report_ids: arrayStrings(record.patch_validation_report_ids),
    changed_files: arrayStrings(record.changed_files),
    patch_artifact_ids: arrayStrings(record.patch_artifact_ids),
    verification_report_ids: arrayStrings(record.verification_report_ids),
    repair_attempt_ids: arrayStrings(record.repair_attempt_ids),
    model_usage_lines: modelUsageLines(record.model_calls_summary ?? record.model_usage),
    model_call_artifact_refs: arrayStrings(record.model_call_artifact_refs),
    artifact_refs: arrayStrings(record.artifact_refs),
    warnings: arrayStrings(record.warnings),
    errors: arrayStrings(record.errors),
  };
}

function modelUsageLines(value: unknown): readonly string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const calls = record.model_calls_by_role && typeof record.model_calls_by_role === "object" ? record.model_calls_by_role as Record<string, unknown> : {};
  const tokens = record.tokens_by_role && typeof record.tokens_by_role === "object" ? record.tokens_by_role as Record<string, unknown> : {};
  const cost = record.cost_by_role && typeof record.cost_by_role === "object" ? record.cost_by_role as Record<string, unknown> : {};
  return Object.entries(calls).map(([role, count]) => {
    const tokenRecord = tokens[role] && typeof tokens[role] === "object" ? tokens[role] as Record<string, unknown> : {};
    const totalTokens = typeof tokenRecord.total_tokens === "number" ? tokenRecord.total_tokens : 0;
    const roleCost = typeof cost[role] === "number" ? cost[role] : 0;
    return `${role}: ${String(count)} call(s), ${totalTokens} token(s), $${roleCost.toFixed(4)}`;
  });
}

function scopeExpansionDetails(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const request = item.request && typeof item.request === "object" ? item.request as Record<string, unknown> : {};
    const requestId = stringField(request.request_id) ?? stringField(item.approval_request_id) ?? "scope";
    const status = stringField(request.status) ?? stringField(item.approval_status) ?? "unknown";
    const digest = stringField(item.request_digest);
    const files = arrayStrings(request.requested_files).join(", ") || "none";
    const resume = stringField(item.resume_status);
    return `${requestId}: ${status}${resume ? `/${resume}` : ""}; files: ${files}${digest ? `; digest: ${digest.slice(0, 12)}` : ""}`;
  });
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
  if (value === "skill_frame" || value === "workflow_skill" || value === "pack_build_plan" || value === "generated_pack" || value === "pack_manifest" || value === "pack_validation_report" || value === "pack_test_report" || value === "pack_install_report" || value === "policy_decision_report" || value === "evidence_bundle" || value === "patch_plan_context" || value === "patch_plan" || value === "patch_validation_report" || value === "patch_artifact" || value === "final_patch_artifact" || value === "scope_expansion_request" || value === "repair_patch_plan" || value === "repair_decision" || value === "source_search_results" || value === "source_snapshot" || value === "source_text" || value === "source_set" || value === "research_brief" || value === "citation_index" || value === "markdown_export" || value === "capability_step_result" || value === "approval_request" || value === "execution_timeline" || value === "worktree_session" || value === "model_call" || value === "raw_log") return value;
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
