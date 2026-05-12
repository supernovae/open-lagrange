import type { RepositoryRunView } from "./repository-run-view.js";

export function formatRepositoryStatus(view: RepositoryRunView): string {
  const phase = view.phases.find((item) => item.status === "running" || item.status === "yielded" || item.status === "failed") ?? view.phases.find((item) => item.status === "pending");
  return [
    `Repository Run: ${view.run_id}`,
    `Status: ${view.status}`,
    `Phase: ${view.current_phase ?? phase?.label ?? "waiting"}`,
    `Goal: ${view.goal.interpreted_goal ?? view.goal.original_prompt ?? view.plan_id}`,
    "",
    "Worktree:",
    `  ${view.worktree_path ?? "not created yet"}`,
    ...(view.branch_name ? [`  branch: ${view.branch_name}`] : []),
    ...(view.base_ref || view.base_commit ? [`  base: ${[view.base_ref, view.base_commit].filter(Boolean).join("@")}`] : []),
    ...(view.worktree_status ? [`  status: ${view.worktree_status}`] : []),
    "",
    "Progress:",
    ...view.phases.map((item) => `  ${marker(item.status)} ${item.label}`),
    "",
    "Changed files:",
    ...(view.files.changed.length > 0 ? view.files.changed.map((file) => `  ${file.path}`) : ["  none recorded yet"]),
    "",
    "Next:",
    ...(view.next_actions.length > 0 ? view.next_actions.slice(0, 5).map((action) => `  ${action.command ?? action.label}`) : [`  open-lagrange run watch ${view.run_id}`]),
  ].join("\n");
}

export function formatRepositoryExplanation(view: RepositoryRunView): string {
  const latestVerification = view.verification_reports.at(-1);
  const latestPatch = view.patch_plans.at(-1);
  return [
    `Repository Run: ${view.run_id}`,
    "",
    "Goal",
    `  ${view.goal.interpreted_goal ?? view.goal.original_prompt ?? view.plan_id}`,
    ...(view.goal.acceptance_criteria.length > 0 ? ["", "Acceptance criteria:", ...view.goal.acceptance_criteria.map((item) => `  - ${item}`)] : []),
    ...(view.goal.non_goals.length > 0 ? ["", "Non-goals:", ...view.goal.non_goals.map((item) => `  - ${item}`)] : []),
    "",
    "Evidence",
    ...(view.files.inspected.length > 0 ? view.files.inspected.map((file) => `  - ${file.path}${file.reason ? `: ${file.reason}` : ""}`) : ["  No evidence files recorded yet."]),
    "",
    "Patch",
    ...(latestPatch ? [
      `  ${latestPatch.summary}`,
      ...latestPatch.operations.map((operation) => `  - ${operation.kind} ${operation.relative_path}: ${operation.rationale}`),
    ] : ["  No PatchPlan recorded yet."]),
    "",
    "Changed files",
    ...(view.files.changed.length > 0 ? view.files.changed.map((file) => `  - ${file.path}`) : ["  none recorded yet"]),
    "",
    "Verification",
    ...(latestVerification ? verificationLines(latestVerification) : ["  No verification report recorded yet."]),
    ...(view.repair_attempts.length > 0 ? ["", "Repair", ...view.repair_attempts.map((attempt) => `  Attempt ${attempt.attempt}: ${attempt.status} - ${attempt.failure_summary}`)] : []),
    ...(view.scope_expansion_requests.length > 0 ? ["", "Scope requests", ...view.scope_expansion_requests.map((request) => `  ${request.request_id}: ${request.reason} (${request.approval_status})`)] : []),
    ...(view.review_report ? ["", "Review", `  ${view.review_report.summary}`] : []),
    ...(view.final_patch ? ["", "Final patch", `  artifact: ${view.final_patch.artifact_id}`, `  export: ${view.final_patch.export_command}`, `  apply manually: ${view.final_patch.apply_command}`] : []),
    ...(view.warnings.length > 0 ? ["", "Warnings", ...view.warnings.map((warning) => `  - ${warning}`)] : []),
    ...(view.next_actions.length > 0 ? ["", "Next actions", ...view.next_actions.map((action) => `  - ${action.command ?? action.label}`)] : []),
  ].join("\n");
}

export function formatRepositoryEvidence(view: RepositoryRunView): string {
  return [
    `Repository Run: ${view.run_id}`,
    "Evidence:",
    ...(view.evidence.length > 0 ? view.evidence.flatMap((bundle) => [
      `  ${bundle.evidence_bundle_id}`,
      ...bundle.files.map((file) => `    - ${file.path}${file.reason ? `: ${file.reason}` : ""}`),
      ...bundle.findings.map((finding) => `    finding: ${finding}`),
    ]) : ["  No evidence bundle recorded yet."]),
  ].join("\n");
}

export function formatRepositoryVerification(view: RepositoryRunView): string {
  return [
    `Repository Run: ${view.run_id}`,
    "Verification:",
    ...(view.verification_reports.length > 0 ? view.verification_reports.flatMap(verificationLines) : ["  No verification report recorded yet."]),
  ].join("\n");
}

export function formatRepositoryWorktree(view: RepositoryRunView): string {
  return [
    `Repository Run: ${view.run_id}`,
    "Worktree:",
    `  path: ${view.worktree_path ?? "not created yet"}`,
    ...(view.branch_name ? [`  branch: ${view.branch_name}`] : []),
    ...(view.base_ref ? [`  base ref: ${view.base_ref}`] : []),
    ...(view.base_commit ? [`  base commit: ${view.base_commit}`] : []),
    ...(view.worktree_status ? [`  status: ${view.worktree_status}`] : []),
    ...(view.worktree_path ? [`  cleanup: open-lagrange repo cleanup ${view.plan_id}`] : []),
  ].join("\n");
}

function verificationLines(report: RepositoryRunView["verification_reports"][number]): string[] {
  return [
    `  ${report.verification_report_id}: ${report.passed ? "passed" : "failed"}`,
    ...report.command_results.map((result) => `  - ${result.command_id}: ${result.status}${result.exit_code === null ? "" : ` (${result.exit_code})`}${result.stderr_preview ? ` - ${oneLine(result.stderr_preview)}` : ""}`),
    ...report.failures.map((failure) => `  failure: ${failure.summary}`),
  ];
}

function marker(status: string): string {
  if (status === "completed") return "[x]";
  if (status === "running") return ">";
  if (status === "failed") return "[!]";
  if (status === "yielded") return "!";
  if (status === "skipped") return "-";
  return "[ ]";
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}
