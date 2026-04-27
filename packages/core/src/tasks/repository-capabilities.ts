import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { repositoryCapabilitySnapshot } from "../capability-packs/repository/descriptors.js";
import { RepositoryWorkspace } from "../schemas/repository.js";

export const discoverRepositoryCapabilitiesTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "discover-repository-capabilities",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    return toHatchetJsonObject(repositoryCapabilitySnapshot(RepositoryWorkspace.parse(input), new Date().toISOString()));
  },
});
