import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { inMemoryApprovalStore } from "../approval/approval-store.js";
import { ApprovalRequest } from "../schemas/reconciliation.js";

export const createApprovalRequestTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "create-approval-request",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    return toHatchetJsonObject(await inMemoryApprovalStore.createApprovalRequest(ApprovalRequest.parse(input)));
  },
});
