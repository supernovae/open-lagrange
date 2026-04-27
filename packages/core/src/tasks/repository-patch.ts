import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { buildPackExecutionContext } from "../capability-registry/context.js";
import { executeCapabilityThroughRegistry } from "../capability-registry/registry.js";
import { DelegationContext } from "../schemas/delegation.js";
import { AppliedPatchResult, PatchPlan, PatchPreview } from "../schemas/patch-plan.js";
import { RepositoryWorkspace } from "../schemas/repository.js";
import { z } from "zod";

const Input = z.object({
  workspace: RepositoryWorkspace,
  patch_plan: PatchPlan,
  delegation_context: DelegationContext,
  task_run_id: z.string().min(1),
  snapshot_id: z.string().min(1),
}).strict();

export const proposeRepositoryPatchTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "propose-repository-patch",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = Input.parse(input);
    const result = await executeCapabilityThroughRegistry({
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.propose_patch",
      arguments: { patch_plan: parsed.patch_plan },
      context: repoContext(parsed, `repo-propose-${parsed.patch_plan.idempotency_key}`),
    });
    return toHatchetJsonObject(PatchPreview.parse(result.output));
  },
});

export const applyRepositoryPatchTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "apply-repository-patch",
  retries: 0,
  executionTimeout: "30s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = Input.parse(input);
    const result = await executeCapabilityThroughRegistry({
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.apply_patch",
      arguments: { patch_plan: parsed.patch_plan, idempotency_key: parsed.patch_plan.idempotency_key },
      context: repoContext(parsed, parsed.patch_plan.idempotency_key),
    });
    return toHatchetJsonObject(AppliedPatchResult.parse(result.output));
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
