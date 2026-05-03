import type { Context } from "@hatchet-dev/typescript-sdk/v1/index.js";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { executeRunContinuation } from "../planning/control-plane.js";

export const planNodeReplayWorkflow = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "plan-node-replay",
  retries: 0,
  executionTimeout: "30m",
  fn: async (rawInput: HatchetJsonObject, _ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const continuationId = String(rawInput.continuation_id ?? "");
    const snapshot = await executeRunContinuation(continuationId);
    return toHatchetJsonObject({ continuation_id: continuationId, snapshot });
  },
});
