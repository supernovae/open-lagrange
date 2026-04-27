import { z } from "zod";
import { DelegationContext } from "./delegation.js";
import { ApprovalRequest } from "./reconciliation.js";
import { CapabilitySnapshot } from "./capabilities.js";
import { PatchPlan, PatchPreview } from "./patch-plan.js";

export const RepositoryCommand = z.object({
  command_id: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()),
  display: z.string().min(1),
}).strict();

export const RepositoryWorkspace = z.object({
  workspace_id: z.string().min(1),
  repo_root: z.string().min(1),
  repo_name: z.string().min(1),
  default_branch: z.string().min(1),
  working_branch: z.string().min(1),
  allowed_paths: z.array(z.string()),
  denied_paths: z.array(z.string()),
  max_file_bytes: z.number().int().min(1),
  max_files_per_task: z.number().int().min(1),
  allowed_commands: z.array(RepositoryCommand),
  denied_commands: z.array(z.string()),
  require_approval_for_write: z.boolean(),
  require_approval_for_command: z.boolean(),
  trace_id: z.string().min(1),
}).strict();

export const RepositoryFileInfo = z.object({
  relative_path: z.string().min(1),
  size: z.number().int().min(0),
  extension: z.string(),
  modified_at: z.string().optional(),
}).strict();

export const RepositoryFileRead = z.object({
  relative_path: z.string().min(1),
  content: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().min(0),
  truncated: z.boolean(),
}).strict();

export const RepositorySearchMatch = z.object({
  relative_path: z.string().min(1),
  line_number: z.number().int().min(1),
  preview: z.string(),
}).strict();

export const VerificationResult = z.object({
  command_id: z.string().min(1),
  command: z.string().min(1),
  exit_code: z.number().int(),
  stdout_preview: z.string(),
  stderr_preview: z.string(),
  duration_ms: z.number().int().min(0),
  truncated: z.boolean(),
}).strict();

export const VerificationReport = z.object({
  results: z.array(VerificationResult),
  passed: z.boolean(),
  summary: z.string(),
}).strict();

export const DiffReport = z.object({
  diff_text: z.string(),
  diff_stat: z.string(),
  changed_files: z.array(z.string()),
}).strict();

export const ReviewReport = z.object({
  pr_title: z.string().min(1),
  pr_summary: z.string().min(1),
  test_notes: z.array(z.string()),
  risk_notes: z.array(z.string()),
  follow_up_notes: z.array(z.string()),
}).strict();

export const RepositoryPhase = z.enum([
  "accepted",
  "discovering_capabilities",
  "planning",
  "inspecting",
  "planning_patch",
  "awaiting_approval",
  "applying_patch",
  "verifying",
  "reviewing",
  "completed",
  "completed_with_errors",
  "yielded",
  "failed",
]);

export const RepositoryTaskStatus = z.object({
  workspace_id: z.string().min(1),
  repo_root: z.string().min(1),
  current_phase: RepositoryPhase,
  inspected_files: z.array(z.string()),
  planned_files: z.array(z.string()),
  changed_files: z.array(z.string()),
  verification_results: z.array(VerificationResult),
  diff_summary: z.string().optional(),
  diff_text: z.string().optional(),
  review_report: ReviewReport.optional(),
  approval_request: ApprovalRequest.optional(),
  errors: z.array(z.unknown()),
  observations: z.array(z.unknown()),
}).strict();

export const RepositoryTaskInput = z.object({
  goal: z.string().min(1),
  repo_root: z.string().min(1),
  workspace_id: z.string().optional(),
  task_run_id: z.string().min(1),
  project_id: z.string().min(1),
  dry_run: z.boolean(),
  apply: z.boolean(),
  require_approval: z.boolean().optional(),
  delegation_context: DelegationContext,
  verification_command_ids: z.array(z.string()).default(["npm_run_typecheck"]),
}).strict();

export const RepositoryApprovalContinuationPayload = z.object({
  goal: z.string().min(1),
  workspace: RepositoryWorkspace,
  delegation_context: DelegationContext,
  patch_plan: PatchPlan,
  patch_preview: PatchPreview,
  capability_snapshot: CapabilitySnapshot,
  verification_command_ids: z.array(z.string()),
  inspected_files: z.array(z.string()),
}).strict();

export type RepositoryCommand = z.infer<typeof RepositoryCommand>;
export type RepositoryWorkspace = z.infer<typeof RepositoryWorkspace>;
export type RepositoryFileInfo = z.infer<typeof RepositoryFileInfo>;
export type RepositoryFileRead = z.infer<typeof RepositoryFileRead>;
export type RepositorySearchMatch = z.infer<typeof RepositorySearchMatch>;
export type VerificationResult = z.infer<typeof VerificationResult>;
export type VerificationReport = z.infer<typeof VerificationReport>;
export type DiffReport = z.infer<typeof DiffReport>;
export type ReviewReport = z.infer<typeof ReviewReport>;
export type RepositoryPhase = z.infer<typeof RepositoryPhase>;
export type RepositoryTaskStatus = z.infer<typeof RepositoryTaskStatus>;
export type RepositoryTaskInput = z.infer<typeof RepositoryTaskInput>;
export type RepositoryApprovalContinuationPayload = z.infer<typeof RepositoryApprovalContinuationPayload>;
