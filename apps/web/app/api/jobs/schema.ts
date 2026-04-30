import { z } from "zod";

export const SubmitJobPayload = z.object({
  goal: z.string().min(1).max(8_000),
  workspace_id: z.string().min(1).max(128).optional(),
  project_id: z.string().min(1).max(128).optional(),
  allowed_scopes: z.array(z.string().min(1).max(128)).max(32).optional(),
}).strict();
