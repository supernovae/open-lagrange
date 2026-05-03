import type { Context } from "@hatchet-dev/typescript-sdk/v1/index.js";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { executeStoredRun } from "../planning/control-plane.js";

export const planRunWorkflow = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "plan-run-workflow",
  retries: 0,
  executionTimeout: "30m",
  fn: async (rawInput: HatchetJsonObject, _ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const runId = String(rawInput.run_id ?? "");
    const snapshot = await executeStoredRun(runId);
    return toHatchetJsonObject({ run_id: runId, snapshot });
  },
});
