import type { NextAction } from "../runs/run-next-action.js";
import type { RepositoryPlanStatus } from "./repository-status.js";

export function repositoryNextActions(input: {
  readonly plan_id: string;
  readonly run_id: string;
  readonly status: RepositoryPlanStatus;
  readonly final_patch_artifact_id?: string;
}): readonly NextAction[] {
  const actions: NextAction[] = [];
  for (const request of input.status.scope_expansion_requests) {
    if (request.approval_status !== "requested") continue;
    actions.push({
      action_id: `repo_scope_approve:${request.request.request_id}`,
      label: `Approve scope request ${request.request.request_id}`,
      command: request.suggested_approve_command,
      action_type: "approve",
      required: true,
      target_ref: request.request.request_id,
      description: request.request.reason,
    });
    actions.push({
      action_id: `repo_scope_reject:${request.request.request_id}`,
      label: `Reject scope request ${request.request.request_id}`,
      command: request.suggested_reject_command,
      action_type: "reject",
      required: true,
      target_ref: request.request.request_id,
      description: request.request.reason,
    });
  }
  if (input.status.status === "yielded") {
    actions.push({
      action_id: `repo_resume:${input.plan_id}`,
      label: "Resume repository run",
      command: `open-lagrange repo resume ${input.plan_id}`,
      action_type: "resume",
      required: input.status.scope_expansion_requests.every((request) => request.approval_status !== "requested"),
      target_ref: input.run_id,
      ...(input.status.remediation ? { description: input.status.remediation } : {}),
    });
  }
  if (input.status.status === "failed" || input.status.status === "yielded") {
    actions.push({
      action_id: `repo_explain:${input.plan_id}`,
      label: "Explain repository run",
      command: `open-lagrange repo explain ${input.plan_id}`,
      action_type: "inspect_artifact",
      required: false,
      target_ref: input.run_id,
    });
  }
  if (input.final_patch_artifact_id) {
    actions.push({
      action_id: `repo_patch_export:${input.final_patch_artifact_id}`,
      label: "Export final patch",
      command: `open-lagrange repo patch ${input.plan_id} --output final.patch`,
      action_type: "export",
      required: false,
      target_ref: input.final_patch_artifact_id,
    });
  }
  if (input.status.worktree_session && input.status.worktree_session.status !== "cleaned") {
    actions.push({
      action_id: `repo_cleanup:${input.plan_id}`,
      label: "Clean up worktree",
      command: `open-lagrange repo cleanup ${input.plan_id}`,
      action_type: "cancel",
      required: false,
      target_ref: input.status.worktree_session.worktree_id,
    });
  }
  actions.push({
    action_id: `repo_watch:${input.run_id}`,
    label: "Watch live run events",
    command: `open-lagrange run watch ${input.run_id}`,
    action_type: "inspect_artifact",
    required: false,
    target_ref: input.run_id,
  });
  return actions;
}
