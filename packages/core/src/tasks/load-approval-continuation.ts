import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { ApprovalContinuationContext, ApprovalContinuationInput, ApprovalDecision } from "../schemas/reconciliation.js";
import { getStateStore } from "../storage/state-store.js";

export const LoadApprovalContinuationOutput = ApprovalContinuationInput.extend({
  decision: ApprovalDecision.optional(),
  context: ApprovalContinuationContext.optional(),
}).strict();

export const loadApprovalContinuationTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "load-approval-continuation",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = ApprovalContinuationInput.parse(input);
    const store = getStateStore();
    return toHatchetJsonObject(LoadApprovalContinuationOutput.parse({
      ...parsed,
      decision: await store.getApprovalDecision(parsed.approval_request_id),
      context: await store.getContinuationContext(parsed.approval_request_id),
    }));
  },
});
