import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { applyRepositoryPatch, proposeRepositoryPatch } from "../capability-packs/repository/executor.js";
import { PatchPlan } from "../schemas/patch-plan.js";
import { RepositoryWorkspace } from "../schemas/repository.js";

export const proposeRepositoryPatchTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "propose-repository-patch",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    return toHatchetJsonObject(proposeRepositoryPatch(
      RepositoryWorkspace.parse(input.workspace),
      PatchPlan.parse(input.patch_plan),
    ));
  },
});

export const applyRepositoryPatchTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "apply-repository-patch",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    return toHatchetJsonObject(applyRepositoryPatch(
      RepositoryWorkspace.parse(input.workspace),
      PatchPlan.parse(input.patch_plan),
    ));
  },
});
