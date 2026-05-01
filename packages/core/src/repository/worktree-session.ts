import { z } from "zod";

export const WorktreeSession = z.object({
  worktree_id: z.string().min(1),
  plan_id: z.string().min(1),
  repo_root: z.string().min(1),
  worktree_path: z.string().min(1),
  base_ref: z.string().min(1),
  base_commit: z.string().regex(/^[a-f0-9]{40}$/),
  branch_name: z.string().min(1),
  status: z.enum(["created", "running", "completed", "failed", "retained", "cleaned"]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  final_patch_artifact_id: z.string().min(1).optional(),
  retain_on_failure: z.boolean().optional(),
}).strict();

export type WorktreeSession = z.infer<typeof WorktreeSession>;
