import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { loadRepositoryWorkspace } from "../repository/workspace.js";
import { RepositoryTaskInput } from "../schemas/repository.js";

export const loadRepositoryWorkspaceTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "load-repository-workspace",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = RepositoryTaskInput.parse(input);
    return toHatchetJsonObject(loadRepositoryWorkspace({
      repo_root: parsed.repo_root,
      trace_id: parsed.delegation_context.trace_id,
      dry_run: parsed.dry_run,
      ...(parsed.workspace_id ? { workspace_id: parsed.workspace_id } : {}),
      ...(parsed.require_approval !== undefined ? { require_approval: parsed.require_approval } : {}),
    }));
  },
});
