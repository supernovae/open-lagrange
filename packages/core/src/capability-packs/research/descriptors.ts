import { z } from "zod";
import type { CapabilityDefinition } from "@open-lagrange/capability-sdk";
import { capabilityDigest } from "@open-lagrange/capability-sdk";
import { RESEARCH_PACK_ID } from "./executor.js";

export function researchCapability<Input, Output>(input: {
  readonly name: string;
  readonly description: string;
  readonly input_schema: z.ZodType<Input>;
  readonly output_schema: z.ZodType<Output>;
  readonly side_effect_kind: CapabilityDefinition<Input, Output>["descriptor"]["side_effect_kind"];
  readonly execute: CapabilityDefinition<Input, Output>["execute"];
}): CapabilityDefinition {
  const descriptor = {
    capability_id: `${RESEARCH_PACK_ID}.${input.name}`,
    pack_id: RESEARCH_PACK_ID,
    name: input.name,
    description: input.description,
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    risk_level: "read" as const,
    side_effect_kind: input.side_effect_kind,
    requires_approval: false,
    idempotency_mode: "recommended" as const,
    timeout_ms: 30_000,
    max_attempts: 1,
    scopes: ["research:read"],
    tags: ["research", "sources", "citations"],
    examples: [],
  };
  return {
    descriptor: { ...descriptor, capability_digest: capabilityDigest(descriptor) },
    input_schema: input.input_schema as z.ZodType<unknown>,
    output_schema: input.output_schema as z.ZodType<unknown>,
    execute: (context, value) => input.execute(context, input.input_schema.parse(value)),
  };
}
