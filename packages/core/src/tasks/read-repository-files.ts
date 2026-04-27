import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { buildPackExecutionContext } from "../capability-registry/context.js";
import { executeCapabilityThroughRegistry } from "../capability-registry/registry.js";
import { DelegationContext } from "../schemas/delegation.js";
import { RepositoryFileInfo, RepositoryFileRead, RepositorySearchMatch, RepositoryWorkspace } from "../schemas/repository.js";
import { z } from "zod";

const Input = z.object({
  workspace: RepositoryWorkspace,
  delegation_context: DelegationContext,
  query: z.string(),
  task_run_id: z.string().min(1),
  snapshot_id: z.string().min(1),
}).strict();

export const readRepositoryFilesTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "read-repository-files",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = Input.parse(input);
    const workspace = parsed.workspace;
    const context = repoContext(parsed, "repo-list-files");
    const filesResult = await executeCapabilityThroughRegistry({
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.list_files",
      arguments: { relative_path: ".", max_results: workspace.max_files_per_task },
      context,
    });
    const files = z.array(RepositoryFileInfo).parse(filesResult.output);
    const preferred = files.filter((file) => ["README.md", "package.json", "apps/cli/src/index.ts"].includes(file.relative_path));
    const selected = (preferred.length > 0 ? preferred : files).slice(0, Math.min(6, workspace.max_files_per_task));
    const reads = [];
    for (const file of selected) {
      const result = await executeCapabilityThroughRegistry({
        endpoint_id: "open-lagrange.repository",
        capability_name: "repo.read_file",
        arguments: { relative_path: file.relative_path },
        context: repoContext(parsed, `repo-read-${file.relative_path}`),
      });
      reads.push(RepositoryFileRead.parse(result.output));
    }
    const matchesResult = await executeCapabilityThroughRegistry({
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.search_text",
      arguments: { query: parsed.query, max_results: 12 },
      context: repoContext(parsed, "repo-search"),
    });
    return toHatchetJsonObject({
      files,
      reads,
      matches: z.array(RepositorySearchMatch).parse(matchesResult.output),
    });
  },
});

function repoContext(input: z.infer<typeof Input>, idempotency_key: string) {
  return buildPackExecutionContext({
    delegation_context: input.delegation_context,
    capability_snapshot_id: input.snapshot_id,
    project_id: input.delegation_context.project_id,
    workspace_id: input.workspace.workspace_id,
    task_run_id: input.task_run_id,
    trace_id: input.delegation_context.trace_id,
    idempotency_key,
    policy_decision: { outcome: "allow" },
    execution_bounds: {},
    timeout_ms: 30_000,
    runtime_config: { workspace: input.workspace },
  });
}
