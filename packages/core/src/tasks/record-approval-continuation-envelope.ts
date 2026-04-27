import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { ApprovalContinuationEnvelope } from "../schemas/reconciliation.js";
import { getStateStore } from "../storage/state-store.js";

export const recordApprovalContinuationEnvelopeTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "record-approval-continuation-envelope",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const envelope = ApprovalContinuationEnvelope.parse(input);
    return toHatchetJsonObject(await getStateStore().recordApprovalContinuationEnvelope(envelope));
  },
});

