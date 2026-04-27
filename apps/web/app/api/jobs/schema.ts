import { z } from "zod";

export const SubmitJobPayload = z.object({
  goal: z.string().min(1),
  workspace_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  allowed_scopes: z.array(z.string().min(1)).optional(),
}).strict();
