import { z } from "zod";

export const DurableRunStatus = z.enum(["queued", "running", "requires_approval", "yielded", "failed", "completed", "cancelled"]);
export const RunRuntime = z.enum(["hatchet", "local_dev"]);

export const Run = z.object({
  run_id: z.string().min(1),
  plan_id: z.string().min(1),
  plan_digest: z.string().min(1),
  plan_title: z.string().min(1).optional(),
  status: DurableRunStatus,
  runtime: RunRuntime,
  profile_name: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  active_node_id: z.string().min(1).optional(),
  artifact_refs: z.array(z.string().min(1)),
  approval_refs: z.array(z.string().min(1)),
  model_call_refs: z.array(z.string().min(1)),
  error_refs: z.array(z.string().min(1)),
}).strict();

export type DurableRunStatus = z.infer<typeof DurableRunStatus>;
export type RunRuntime = z.infer<typeof RunRuntime>;
export type Run = z.infer<typeof Run>;
