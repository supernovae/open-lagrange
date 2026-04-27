import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { discoverMockMcpCapabilities } from "../mcp/mock-registry.js";
import { CapabilitySnapshot, RiskLevel } from "../schemas/capabilities.js";
import { DelegationContext } from "../schemas/delegation.js";
import { ScopedTask } from "../schemas/reconciliation.js";
import { z } from "zod";

export const DiscoverCapabilitiesInput = z.object({
  workspace_id: z.string().min(1),
  scoped_task: ScopedTask,
  delegation_context: DelegationContext,
  max_risk_level: RiskLevel,
  now: z.string().datetime(),
}).strict();

export type DiscoverCapabilitiesInput = z.infer<typeof DiscoverCapabilitiesInput>;

export const discoverCapabilitiesTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "discover-capabilities",
  retries: 1,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = DiscoverCapabilitiesInput.parse(input);
    return toHatchetJsonObject(CapabilitySnapshot.parse(discoverMockMcpCapabilities({
      workspace_id: parsed.workspace_id,
      task_scope: parsed.scoped_task,
      delegation_context: parsed.delegation_context,
      max_risk_level: parsed.max_risk_level,
      now: parsed.now,
    })));
  },
});
