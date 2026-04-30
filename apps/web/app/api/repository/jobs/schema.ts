import { z } from "zod";

export const SubmitRepositoryJobPayload = z.object({
  goal: z.string().min(1).max(8_000),
  repo_root: z.string().min(1).max(2_048),
  workspace_id: z.string().min(1).max(128).optional(),
  dry_run: z.boolean().default(true),
  apply: z.boolean().default(false),
  require_approval: z.boolean().optional(),
}).strict();
