import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { ApprovalContinuationEnvelope, ApprovalContinuationInput, ApprovalDecision } from "../schemas/reconciliation.js";
import { getStateStore } from "../storage/state-store.js";

export const LoadApprovalContinuationEnvelopeOutput = ApprovalContinuationInput.extend({
  decision: ApprovalDecision.optional(),
  envelope: ApprovalContinuationEnvelope.optional(),
}).strict();

export const loadApprovalContinuationEnvelopeTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "load-approval-continuation-envelope",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = ApprovalContinuationInput.parse(input);
    const store = getStateStore();
    return toHatchetJsonObject(LoadApprovalContinuationEnvelopeOutput.parse({
      ...parsed,
      decision: await store.getApprovalDecision(parsed.approval_request_id),
      envelope: await store.getApprovalContinuationEnvelope(parsed.approval_request_id),
    }));
  },
});

