import { z } from "zod";

export const NextActionType = z.enum(["approve", "reject", "resume", "retry", "configure_provider", "inspect_artifact", "export", "edit_plan", "cancel"]);

export const NextAction = z.object({
  action_id: z.string().min(1),
  label: z.string().min(1),
  command: z.string().min(1).optional(),
  action_type: NextActionType,
  required: z.boolean(),
  target_ref: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
}).strict();

export type NextActionType = z.infer<typeof NextActionType>;
export type NextAction = z.infer<typeof NextAction>;

export function deriveRunNextActions(input: {
  readonly run_id: string;
  readonly status: string;
  readonly active_node_id?: string;
  readonly approvals: readonly { readonly approval_id: string; readonly status: string }[];
  readonly artifacts: readonly { readonly artifact_id: string; readonly exportable: boolean }[];
  readonly errors: readonly { readonly message: string }[];
}): NextAction[] {
  const actions: NextAction[] = [];
  const requested = input.approvals.filter((approval) => approval.status === "requested");
  for (const approval of requested) {
    actions.push({ action_id: `approve:${approval.approval_id}`, label: `Approve ${approval.approval_id}`, command: `open-lagrange run approve ${input.run_id} ${approval.approval_id}`, action_type: "approve", required: true, target_ref: approval.approval_id });
    actions.push({ action_id: `reject:${approval.approval_id}`, label: `Reject ${approval.approval_id}`, command: `open-lagrange run reject ${input.run_id} ${approval.approval_id}`, action_type: "reject", required: true, target_ref: approval.approval_id });
  }
  if (input.status === "yielded" || input.status === "requires_approval") {
    actions.push({ action_id: `resume:${input.run_id}`, label: "Resume run", command: `open-lagrange run resume ${input.run_id}`, action_type: "resume", required: requested.length === 0, target_ref: input.run_id });
  }
  if ((input.status === "failed" || input.status === "yielded") && input.active_node_id) {
    actions.push({ action_id: `retry:${input.active_node_id}`, label: `Retry ${input.active_node_id}`, command: `open-lagrange run retry ${input.run_id} ${input.active_node_id} --mode reuse-artifacts`, action_type: "retry", required: input.status === "failed", target_ref: input.active_node_id });
  }
  if (input.errors.some((error) => /provider|secret|credential/i.test(error.message))) {
    actions.push({ action_id: "configure_provider", label: "Configure provider", command: "open-lagrange provider list", action_type: "configure_provider", required: true });
  }
  const artifact = input.artifacts[0];
  if (artifact) {
    actions.push({ action_id: `inspect:${artifact.artifact_id}`, label: `Inspect ${artifact.artifact_id}`, command: `open-lagrange artifact show ${artifact.artifact_id}`, action_type: "inspect_artifact", required: false, target_ref: artifact.artifact_id });
    if (artifact.exportable) actions.push({ action_id: `export:${artifact.artifact_id}`, label: `Export ${artifact.artifact_id}`, command: `open-lagrange artifact export ${artifact.artifact_id} --output ./artifact.out`, action_type: "export", required: false, target_ref: artifact.artifact_id });
  }
  actions.push({ action_id: `edit_plan:${input.run_id}`, label: "Edit plan", command: `open-lagrange run explain ${input.run_id}`, action_type: "edit_plan", required: false, target_ref: input.run_id });
  if (!["completed", "failed", "cancelled"].includes(input.status)) {
    actions.push({ action_id: `cancel:${input.run_id}`, label: "Cancel run", command: `open-lagrange run cancel ${input.run_id}`, action_type: "cancel", required: false, target_ref: input.run_id });
  }
  return actions;
}
