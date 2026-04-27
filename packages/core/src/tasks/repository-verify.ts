import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { getRepositoryDiffReport, runRepositoryVerificationReport } from "../capability-packs/repository/executor.js";
import { RepositoryWorkspace } from "../schemas/repository.js";
import { z } from "zod";

export const runRepositoryVerificationTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "run-repository-verification",
  retries: 0,
  executionTimeout: "3m",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const workspace = RepositoryWorkspace.parse(input.workspace);
    const commandIds = z.array(z.string()).parse(input.command_ids);
    return toHatchetJsonObject(await runRepositoryVerificationReport(workspace, commandIds));
  },
});

export const getRepositoryDiffTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "get-repository-diff",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const workspace = RepositoryWorkspace.parse(input.workspace);
    const paths = z.array(z.string()).optional().parse(input.paths);
    return toHatchetJsonObject(await getRepositoryDiffReport(workspace, paths ?? []));
  },
});
