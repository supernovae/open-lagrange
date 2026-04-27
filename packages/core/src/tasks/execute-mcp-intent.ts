import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { executeMockMcpEndpoint } from "../mcp/mock-client.js";
import { DelegationContext } from "../schemas/delegation.js";
import { z } from "zod";

export const ExecuteMcpIntentInput = z.object({
  endpoint_id: z.string().min(1),
  capability_name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  idempotency_key: z.string().min(1),
  delegation_context: DelegationContext,
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
    return toHatchetJsonObject(ExecuteMcpIntentOutput.parse(await executeMockMcpEndpoint(parsed)));
  },
});
