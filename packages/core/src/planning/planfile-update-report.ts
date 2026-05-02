import { z } from "zod";
import { StructuredError } from "../schemas/open-cot.js";
import { PlannerQuestion } from "./plan-builder-question.js";
import { PlanBuilderStatus } from "./plan-builder-status.js";
import { PlanSimulationStatus } from "./plan-simulation.js";
import { PlanfileStructuredDiff } from "./planfile-diff.js";

export const PlanfileRevision = z.object({
  revision_id: z.string().min(1),
  session_id: z.string().min(1),
  source: z.enum(["web", "tui", "cli", "external_file"]),
  previous_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  new_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  status: z.enum(["accepted", "rejected", "needs_input"]),
  summary: z.string().min(1),
  created_at: z.string().datetime(),
  artifact_refs: z.array(z.string().min(1)),
}).strict();

export type PlanfileRevision = z.infer<typeof PlanfileRevision>;

export const PlanfileUpdateReport = z.object({
  session_id: z.string().min(1),
  previous_plan_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  new_plan_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  parse_status: z.enum(["passed", "failed"]),
  diff_status: z.enum(["unchanged", "changed", "not_available"]),
  simulation_status: z.union([PlanSimulationStatus, z.literal("not_run")]),
  validation_status: z.enum(["not_run", "passed", "failed"]),
  builder_status: PlanBuilderStatus,
  diff: PlanfileStructuredDiff.optional(),
  questions: z.array(PlannerQuestion),
  validation_errors: z.array(StructuredError),
  simulation_warnings: z.array(z.string()),
  regenerated_markdown: z.string().optional(),
  mermaid: z.string().optional(),
  artifact_refs: z.array(z.string().min(1)),
}).strict();

export type PlanfileUpdateReport = z.infer<typeof PlanfileUpdateReport>;
