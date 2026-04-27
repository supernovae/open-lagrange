import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { ApprovalContinuationContext } from "../schemas/reconciliation.js";
import { getStateStore } from "../storage/state-store.js";

export const recordContinuationContextTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "record-continuation-context",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    return toHatchetJsonObject(await getStateStore().recordContinuationContext(ApprovalContinuationContext.parse(input)));
  },
});
