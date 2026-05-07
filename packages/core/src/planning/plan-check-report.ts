import { z } from "zod";
import { StructuredError } from "../schemas/open-cot.js";
import { NextAction } from "../runs/run-next-action.js";

export const RequirementStatus = z.object({
  kind: z.enum(["pack", "provider", "credential", "permission", "approval", "runtime", "schedule"]),
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  status: z.enum(["present", "missing", "optional_missing", "misconfigured", "unsupported"]),
  detail: z.string().min(1).optional(),
  suggested_command: z.string().min(1).optional(),
}).strict();

export const ApprovalRequirementSummary = z.object({
  approval_id: z.string().min(1),
  label: z.string().min(1),
  risk_level: z.string().min(1).optional(),
  node_id: z.string().min(1).optional(),
  required: z.boolean(),
  suggested_command: z.string().min(1).optional(),
}).strict();

export const SideEffectSummary = z.object({
  node_id: z.string().min(1),
  label: z.string().min(1),
  risk_level: z.string().min(1),
  requires_approval: z.boolean(),
}).strict();

export const PredictedArtifact = z.object({
  artifact_id: z.string().min(1).optional(),
  kind: z.string().min(1),
  label: z.string().min(1),
  node_id: z.string().min(1).optional(),
}).strict();

export const PlanCheckReport = z.object({
  plan_id: z.string().min(1),
  plan_digest: z.string().min(1),
  status: z.enum(["runnable", "runnable_with_warnings", "missing_requirements", "invalid", "unsafe"]),
  portability: z.enum(["portable", "workspace_bound", "profile_bound", "machine_bound"]),
  required_packs: z.array(RequirementStatus),
  required_providers: z.array(RequirementStatus),
  required_credentials: z.array(RequirementStatus),
  required_permissions: z.array(RequirementStatus),
  approval_requirements: z.array(ApprovalRequirementSummary),
  schedule_requirements: z.array(RequirementStatus).optional(),
  execution_mode_warnings: z.array(z.string().min(1)),
  side_effects: z.array(SideEffectSummary),
  predicted_artifacts: z.array(PredictedArtifact),
  validation_errors: z.array(StructuredError),
  warnings: z.array(z.string().min(1)),
  suggested_actions: z.array(NextAction),
}).strict();

export type RequirementStatus = z.infer<typeof RequirementStatus>;
export type ApprovalRequirementSummary = z.infer<typeof ApprovalRequirementSummary>;
export type SideEffectSummary = z.infer<typeof SideEffectSummary>;
export type PredictedArtifact = z.infer<typeof PredictedArtifact>;
export type PlanCheckReport = z.infer<typeof PlanCheckReport>;

export function planCheckBlocksRun(report: PlanCheckReport): boolean {
  return report.status === "invalid" || report.status === "unsafe" || report.status === "missing_requirements";
}
