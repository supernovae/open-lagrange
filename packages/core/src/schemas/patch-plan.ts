import { z } from "zod";
import { RiskLevel } from "./capabilities.js";

export const FilePatch = z.object({
  relative_path: z.string().min(1),
  operation: z.enum(["create", "modify", "delete"]),
  expected_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  unified_diff: z.string().optional(),
  full_replacement: z.string().optional(),
  append_text: z.string().optional(),
  rationale: z.string().min(1),
}).strict().refine((value) => {
  const present = [value.unified_diff, value.full_replacement, value.append_text].filter((item) => item !== undefined).length;
  return value.operation === "delete" ? present === 0 : present === 1;
}, "Exactly one patch body is required for create/modify; delete cannot include a patch body");

export const PatchPlan = z.object({
  patch_plan_id: z.string().min(1),
  goal: z.string().min(1),
  summary: z.string().min(1),
  files: z.array(FilePatch).min(1),
  expected_preconditions: z.array(z.string()),
  risk_level: RiskLevel,
  requires_approval: z.boolean(),
  idempotency_key: z.string().min(1),
}).strict();

export const PatchPreview = z.object({
  patch_plan: PatchPlan,
  touched_files: z.array(z.string()),
  risk_level: RiskLevel,
  requires_approval: z.boolean(),
  diff_preview: z.string(),
}).strict();

export const AppliedPatchFile = z.object({
  relative_path: z.string().min(1),
  operation: z.enum(["create", "modify", "delete"]),
  before_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  after_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const AppliedPatchResult = z.object({
  applied_files: z.array(AppliedPatchFile),
  changed_files: z.array(z.string()),
  diff_summary: z.string(),
}).strict();

export type FilePatch = z.infer<typeof FilePatch>;
export type PatchPlan = z.infer<typeof PatchPlan>;
export type PatchPreview = z.infer<typeof PatchPreview>;
export type AppliedPatchFile = z.infer<typeof AppliedPatchFile>;
export type AppliedPatchResult = z.infer<typeof AppliedPatchResult>;
