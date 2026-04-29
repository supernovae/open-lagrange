import { z } from "zod";
import { RiskLevel } from "../schemas/capabilities.js";

export const RepositoryPatchOperation = z.object({
  operation_id: z.string().min(1),
  kind: z.enum(["replace_range", "insert_after", "create_file", "unified_diff", "full_replacement", "delete_file"]),
  relative_path: z.string().min(1),
  expected_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  start_line: z.number().int().min(1).optional(),
  end_line: z.number().int().min(1).optional(),
  anchor: z.string().optional(),
  content: z.string().optional(),
  unified_diff: z.string().optional(),
  rationale: z.string().min(1),
}).strict();

export const RepositoryPatchPlan = z.object({
  patch_plan_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
  operations: z.array(RepositoryPatchOperation).min(1),
  expected_changed_files: z.array(z.string().min(1)).min(1),
  verification_command_ids: z.array(z.string().min(1)),
  preconditions: z.array(z.string()),
  risk_level: RiskLevel,
  approval_required: z.boolean(),
}).strict();

export type RepositoryPatchOperation = z.infer<typeof RepositoryPatchOperation>;
export type RepositoryPatchPlan = z.infer<typeof RepositoryPatchPlan>;
