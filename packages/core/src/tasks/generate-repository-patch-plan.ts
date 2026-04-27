import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { generatePatchPlan } from "../activities/repository-cognition.js";
import { RepositoryFileRead } from "../schemas/repository.js";
import { z } from "zod";

const Input = z.object({
  goal: z.string().min(1),
  files: z.array(RepositoryFileRead),
  dry_run: z.boolean(),
}).strict();

export const generateRepositoryPatchPlanTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "generate-repository-patch-plan",
  retries: 1,
  executionTimeout: "2m",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    return toHatchetJsonObject(await generatePatchPlan(Input.parse(input)));
  },
});
