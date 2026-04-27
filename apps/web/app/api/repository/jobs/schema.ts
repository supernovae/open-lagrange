import { z } from "zod";

export const SubmitRepositoryJobPayload = z.object({
  goal: z.string().min(1),
  repo_root: z.string().min(1),
  workspace_id: z.string().min(1).optional(),
  dry_run: z.boolean().default(true),
  apply: z.boolean().default(false),
  require_approval: z.boolean().optional(),
}).strict();
