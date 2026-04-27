import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import { RepositoryWorkspace } from "../schemas/repository.js";
import { DelegationContext } from "../schemas/delegation.js";
import { z } from "zod";

const Input = z.object({
  workspace: RepositoryWorkspace,
  delegation_context: DelegationContext,
  now: z.string().datetime(),
}).strict();

export const discoverRepositoryCapabilitiesTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "discover-repository-capabilities",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = Input.parse(input);
    return toHatchetJsonObject(createCapabilitySnapshotForTask({
      allowed_scopes: parsed.delegation_context.allowed_scopes,
      denied_scopes: parsed.delegation_context.denied_scopes,
      allowed_capabilities: parsed.delegation_context.allowed_capabilities,
      max_risk_level: parsed.delegation_context.max_risk_level,
      trust_levels: ["trusted_core", "trusted_local"],
      now: parsed.now,
    }));
  },
});
