import { z } from "zod";

export const PlanBuilderStatus = z.enum([
  "drafting",
  "simulating",
  "validating",
  "needs_input",
  "revising",
  "ready",
  "approved",
  "yielded",
]);

export type PlanBuilderStatus = z.infer<typeof PlanBuilderStatus>;
