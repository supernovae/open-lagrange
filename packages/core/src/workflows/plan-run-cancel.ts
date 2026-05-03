import type { Context } from "@hatchet-dev/typescript-sdk/v1/index.js";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { executeRunCancellation } from "../planning/control-plane.js";

export const planRunCancelWorkflow = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "plan-run-cancel",
  retries: 0,
  executionTimeout: "5m",
  fn: async (rawInput: HatchetJsonObject, _ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const continuationId = String(rawInput.continuation_id ?? "");
    const snapshot = await executeRunCancellation(continuationId);
    return toHatchetJsonObject({ continuation_id: continuationId, snapshot });
  },
});
