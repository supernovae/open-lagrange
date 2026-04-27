import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { listRepositoryFiles, readRepositoryFile, searchRepositoryText } from "../capability-packs/repository/executor.js";
import { RepositoryWorkspace } from "../schemas/repository.js";

export const readRepositoryFilesTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "read-repository-files",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const workspace = RepositoryWorkspace.parse(input.workspace);
    const files = listRepositoryFiles(workspace, { relative_path: ".", max_results: workspace.max_files_per_task });
    const preferred = files.filter((file) => ["README.md", "package.json", "apps/cli/src/index.ts"].includes(file.relative_path));
    const selected = (preferred.length > 0 ? preferred : files).slice(0, Math.min(6, workspace.max_files_per_task));
    return toHatchetJsonObject({
      files,
      reads: selected.map((file) => readRepositoryFile(workspace, { relative_path: file.relative_path })),
      matches: searchRepositoryText(workspace, { query: String(input.query ?? ""), max_results: 12 }),
    });
  },
});
