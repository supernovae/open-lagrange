import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
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
    return toHatchetJsonObject(CapabilitySnapshot.parse(createCapabilitySnapshotForTask({
      allowed_scopes: parsed.delegation_context.allowed_scopes.filter((scope) => parsed.scoped_task.allowed_scopes.includes(scope)),
      denied_scopes: parsed.delegation_context.denied_scopes,
      allowed_capabilities: [...parsed.delegation_context.allowed_capabilities, ...parsed.scoped_task.allowed_capabilities],
      max_risk_level: parsed.max_risk_level,
      trust_levels: ["trusted_core", "trusted_local"],
      now: parsed.now,
    })));
  },
});
