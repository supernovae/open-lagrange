import type { RunSnapshot } from "./run-snapshot.js";

export function deriveRunNextActions(input: {
  readonly run_id: string;
  readonly status: RunSnapshot["status"];
  readonly active_node_id?: string;
  readonly approvals: RunSnapshot["approvals"];
  readonly artifacts: RunSnapshot["artifacts"];
  readonly errors: RunSnapshot["errors"];
}): RunSnapshot["next_actions"] {
  const actions: RunSnapshot["next_actions"] = [];
  const requested = input.approvals.filter((approval) => approval.status === "requested");
  for (const approval of requested) {
    actions.push({ label: `Approve ${approval.approval_id}`, command: `open-lagrange run approve ${input.run_id} ${approval.approval_id}`, action_type: "approve", required: true });
    actions.push({ label: `Reject ${approval.approval_id}`, command: `open-lagrange run reject ${input.run_id} ${approval.approval_id}`, action_type: "reject", required: true });
  }
  if (input.status === "yielded") {
    actions.push({ label: "Resume run", command: `open-lagrange run resume ${input.run_id}`, action_type: "resume", required: requested.length === 0 });
  }
  if (input.status === "failed" && input.active_node_id) {
    actions.push({ label: `Retry ${input.active_node_id}`, command: `open-lagrange run retry ${input.run_id} ${input.active_node_id} --mode <replay-mode>`, action_type: "retry", required: true });
  }
  if (input.errors.some((error) => /provider|secret|credential/i.test(error.message))) {
    actions.push({ label: "Configure provider", command: "open-lagrange provider list", action_type: "configure_provider", required: true });
  }
  if (input.artifacts.length > 0) {
    const artifact = input.artifacts[0];
    if (artifact) {
      actions.push({ label: `Inspect ${artifact.artifact_id}`, command: `open-lagrange artifact show ${artifact.artifact_id}`, action_type: "inspect_artifact", required: false });
      if (artifact.exportable) actions.push({ label: `Export ${artifact.artifact_id}`, command: `open-lagrange artifact export ${artifact.artifact_id} --output ./artifact.out`, action_type: "export", required: false });
    }
  }
  actions.push({ label: "Edit plan", command: `open-lagrange plan status ${input.run_id}`, action_type: "edit_plan", required: false });
  return actions;
}
