import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { buildPackExecutionContext } from "../capability-registry/context.js";
import { executeCapabilityThroughRegistry } from "../capability-registry/registry.js";
import { DelegationContext } from "../schemas/delegation.js";
import { z } from "zod";

export const ExecuteMcpIntentInput = z.object({
  endpoint_id: z.string().min(1),
  capability_name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  idempotency_key: z.string().min(1),
  delegation_context: DelegationContext,
  capability_snapshot_id: z.string().optional(),
}).strict();

export const ExecuteMcpIntentOutput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), message: z.string(), result: z.unknown() }).strict(),
  z.object({ status: z.literal("error"), message: z.string() }).strict(),
]);

export type ExecuteMcpIntentOutput = z.infer<typeof ExecuteMcpIntentOutput>;

export const executeMcpIntentTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "execute-mcp-intent",
  retries: 0,
  executionTimeout: "1m",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = ExecuteMcpIntentInput.parse(input);
    const result = await executeCapabilityThroughRegistry({
      endpoint_id: parsed.endpoint_id,
      capability_name: parsed.capability_name,
      arguments: parsed.arguments,
      context: buildPackExecutionContext({
        delegation_context: parsed.delegation_context,
        capability_snapshot_id: parsed.capability_snapshot_id ?? "caps_unknown",
        project_id: parsed.delegation_context.project_id,
        workspace_id: parsed.delegation_context.workspace_id,
        task_run_id: parsed.delegation_context.task_run_id ?? "task-run-unknown",
        trace_id: parsed.delegation_context.trace_id,
        idempotency_key: parsed.idempotency_key,
        policy_decision: { outcome: "allow" },
        execution_bounds: {},
        timeout_ms: 60_000,
      }),
    });
    return toHatchetJsonObject(ExecuteMcpIntentOutput.parse(result.status === "success"
      ? { status: "ok", message: "Capability execution succeeded", result: result.output }
      : { status: "error", message: result.structured_errors.map((item) => item && typeof item === "object" && "message" in item ? String(item.message) : "Capability execution failed").join("; ") || "Capability execution failed" }));
  },
});
