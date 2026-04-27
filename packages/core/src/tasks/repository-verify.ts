import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { buildPackExecutionContext } from "../capability-registry/context.js";
import { executeCapabilityThroughRegistry } from "../capability-registry/registry.js";
import { DelegationContext } from "../schemas/delegation.js";
import { DiffReport, RepositoryWorkspace, VerificationReport, VerificationResult } from "../schemas/repository.js";
import { z } from "zod";

const BaseInput = z.object({
  workspace: RepositoryWorkspace,
  delegation_context: DelegationContext,
  task_run_id: z.string().min(1),
  snapshot_id: z.string().min(1),
}).strict();

const VerificationInput = BaseInput.extend({
  command_ids: z.array(z.string()),
}).strict();

const DiffInput = BaseInput.extend({
  paths: z.array(z.string()).optional(),
}).strict();

export const runRepositoryVerificationTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "run-repository-verification",
  retries: 0,
  executionTimeout: "3m",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = VerificationInput.parse(input);
    const results = [];
    for (const commandId of parsed.command_ids) {
      const result = await executeCapabilityThroughRegistry({
        endpoint_id: "open-lagrange.repository",
        capability_name: "repo.run_verification",
        arguments: { command_id: commandId },
        context: repoContext(parsed, `repo-verify-${commandId}`, 120_000),
      });
      const report = VerificationReport.parse(result.output);
      results.push(...report.results);
    }
    return toHatchetJsonObject(VerificationReport.parse({
      results: z.array(VerificationResult).parse(results),
      passed: results.every((result) => result.exit_code === 0),
      summary: results.map((result) => `${result.command}: ${result.exit_code}`).join("; "),
    }));
  },
});

export const getRepositoryDiffTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "get-repository-diff",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = DiffInput.parse(input);
    const result = await executeCapabilityThroughRegistry({
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.get_diff",
      arguments: { paths: parsed.paths ?? [] },
      context: repoContext(parsed, "repo-diff", 30_000),
    });
    return toHatchetJsonObject(DiffReport.parse(result.output));
  },
});

function repoContext(input: z.infer<typeof BaseInput>, idempotency_key: string, timeout_ms: number) {
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
    timeout_ms,
    runtime_config: { workspace: input.workspace },
  });
}
