import { z } from "zod";

export const WorktreeSession = z.object({
  plan_id: z.string().min(1),
  repo_root: z.string().min(1),
  worktree_path: z.string().min(1),
  branch_name: z.string().min(1),
  base_ref: z.string().min(1),
  base_commit: z.string().regex(/^[a-f0-9]{40}$/),
  retain_on_failure: z.boolean(),
  created_at: z.string().datetime(),
}).strict();

export type WorktreeSession = z.infer<typeof WorktreeSession>;
