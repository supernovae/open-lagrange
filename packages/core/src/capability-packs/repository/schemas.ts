import { z } from "zod";
import { PatchPlan } from "../../schemas/patch-plan.js";

export const ListFilesInput = z.object({
  relative_path: z.string().default("."),
  glob: z.string().optional(),
  max_results: z.number().int().min(1).max(500).optional(),
}).strict();

export const ReadFileInput = z.object({
  relative_path: z.string().min(1),
}).strict();

export const SearchTextInput = z.object({
  query: z.string().min(1),
  relative_path: z.string().optional(),
  max_results: z.number().int().min(1).max(100).optional(),
}).strict();

export const ProposePatchInput = z.object({
  patch_plan: PatchPlan,
}).strict();

export const ApplyPatchInput = z.object({
  patch_plan: PatchPlan,
  idempotency_key: z.string().min(1),
}).strict();

export const RunVerificationInput = z.object({
  command_id: z.string().min(1),
  timeout_ms: z.number().int().min(1000).max(120_000).default(30_000),
  output_limit: z.number().int().min(1000).max(200_000).default(20_000),
}).strict();

export const GetDiffInput = z.object({
  paths: z.array(z.string()).optional(),
}).strict();

export const CreateReviewReportInput = z.object({
  goal: z.string().min(1),
  changed_files: z.array(z.string()),
  diff_summary: z.string(),
  verification_results: z.array(z.unknown()),
  critic_output: z.unknown().optional(),
}).strict();

export type ListFilesInput = z.infer<typeof ListFilesInput>;
export type ReadFileInput = z.infer<typeof ReadFileInput>;
export type SearchTextInput = z.infer<typeof SearchTextInput>;
export type ProposePatchInput = z.infer<typeof ProposePatchInput>;
export type ApplyPatchInput = z.infer<typeof ApplyPatchInput>;
export type RunVerificationInput = z.infer<typeof RunVerificationInput>;
export type GetDiffInput = z.infer<typeof GetDiffInput>;
export type CreateReviewReportInput = z.infer<typeof CreateReviewReportInput>;
