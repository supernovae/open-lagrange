import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { runMockCritic } from "../activities/cognition.js";
import { CriticResult, ScopedTask } from "../schemas/reconciliation.js";
import { z } from "zod";

export const RunCriticInput = z.object({
  scoped_task: ScopedTask,
  output: z.unknown(),
  force_outcome: z.enum(["pass", "revise", "yield"]).optional(),
}).strict();

export const runCriticTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "run-critic",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = RunCriticInput.parse(input);
    return toHatchetJsonObject(CriticResult.parse(await runMockCritic({
      scoped_task: parsed.scoped_task,
      output: parsed.output,
      ...(parsed.force_outcome ? { force_outcome: parsed.force_outcome } : {}),
    })));
  },
});
