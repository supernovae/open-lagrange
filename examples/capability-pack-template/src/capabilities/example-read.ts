import type { CapabilityDefinition } from "@open-lagrange/capability-sdk";
import { z } from "zod";

const Input = z.object({ query: z.string().min(1) }).strict();
const Output = z.object({ summary: z.string() }).strict();

export const exampleReadCapability: CapabilityDefinition = {
  descriptor: {
    capability_id: "example.read.example_read",
    pack_id: "example.read",
    name: "example_read",
    description: "Return a bounded example read result.",
    input_schema: { type: "object", required: ["query"], properties: { query: { type: "string" } }, additionalProperties: false },
    output_schema: { type: "object", required: ["summary"], properties: { summary: { type: "string" } }, additionalProperties: false },
    risk_level: "read",
    side_effect_kind: "none",
    requires_approval: false,
    idempotency_mode: "recommended",
    timeout_ms: 5000,
    max_attempts: 1,
    scopes: ["example:read"],
    tags: ["example"],
    examples: [{ input: { query: "status" }, output: { summary: "Example result" } }],
  },
  input_schema: Input as z.ZodType<unknown>,
  output_schema: Output as z.ZodType<unknown>,
  execute: (_context, input) => ({ summary: `Example result for ${Input.parse(input).query}` }),
};

