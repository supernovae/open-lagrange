import { z } from "zod";
import { CapabilitySnapshot, JsonSchemaLike } from "../schemas/capabilities.js";

export const WorkOrder = z.object({
  work_order_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  phase: z.string().min(1),
  objective: z.string().min(1),
  acceptance_criteria: z.array(z.string().min(1)),
  non_goals: z.array(z.string().min(1)),
  assumptions: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  allowed_capability_snapshot: CapabilitySnapshot,
  input_artifacts: z.array(z.string().min(1)),
  required_output_schema: JsonSchemaLike,
  relevant_evidence: z.array(z.string()),
  latest_failures: z.array(z.string()),
  max_attempts: z.number().int().min(1),
  model_role_hint: z.enum(["planner", "implementer", "reviewer", "repair", "summarizer"]),
}).strict();

export type WorkOrder = z.infer<typeof WorkOrder>;
