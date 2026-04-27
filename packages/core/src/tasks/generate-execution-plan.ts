import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { generateExecutionPlan } from "../activities/cognition.js";
import { ProjectReconcilerInput, ExecutionPlan } from "../schemas/reconciliation.js";

export const generateExecutionPlanTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "generate-execution-plan",
  retries: 1,
  executionTimeout: "2m",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = ProjectReconcilerInput.parse(input);
    const plan = await generateExecutionPlan({
      goal: parsed.goal,
      delegation_context: parsed.delegation_context,
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
      max_tasks: parsed.bounds?.max_tasks_per_project ?? 3,
    });
    return toHatchetJsonObject(ExecutionPlan.parse(plan));
  },
});
