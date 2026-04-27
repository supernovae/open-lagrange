import type { CapabilityDefinition, CapabilityPack } from "@open-lagrange/capability-sdk";
import { z } from "zod";

const PACK_ID = "open-lagrange.mock";

const SearchArguments = z.object({ query: z.string().min(1) }).strict();
const ReadArguments = z.object({ path: z.string().min(1) }).strict();
const DraftArguments = z.object({ title: z.string().min(1), source_summary: z.string().min(1) }).strict();
const WriteArguments = z.object({ path: z.string().min(1), content: z.string().min(1) }).strict();

const SearchResult = z.object({
  results: z.array(z.object({ title: z.string(), url: z.string(), summary: z.string() })),
}).strict();
const ReadResult = z.object({ path: z.string(), content: z.string() }).strict();
const DraftResult = z.object({ title: z.string(), content: z.string() }).strict();
const WriteResult = z.object({ path: z.string(), bytes_written: z.number().int().min(0), simulated: z.literal(true) }).strict();

export const mockCapabilityPack: CapabilityPack = {
  manifest: {
    pack_id: PACK_ID,
    name: "Trusted Mock Pack",
    version: "0.1.0",
    description: "Trusted local mock capabilities for the first reconciliation slice.",
    publisher: "open-lagrange",
    license: "MIT",
    runtime_kind: "mock",
    trust_level: "trusted_core",
    required_scopes: ["project:read"],
    provided_scopes: ["project:read", "project:summarize", "project:write"],
    default_policy: { static_registration_only: true },
    open_cot_alignment: { compatibility: "mcp-shaped descriptors" },
  },
  capabilities: [
    capability({
      name: "search_docs",
      description: "Search trusted project documentation.",
      input_schema: SearchArguments,
      output_schema: SearchResult,
      risk_level: "read",
      side_effect_kind: "none",
      requires_approval: false,
      scopes: ["project:read"],
      execute: () => ({
        results: [{
          title: "Open Lagrange README",
          url: "mcp://knowledge/search_docs/readme",
          summary: "Open Lagrange reconciles typed cognitive artifacts through policy-gated endpoint execution.",
        }],
      }),
    }),
    capability({
      name: "read_file",
      description: "Read a sandboxed mock workspace file.",
      input_schema: ReadArguments,
      output_schema: ReadResult,
      risk_level: "read",
      side_effect_kind: "filesystem_read",
      requires_approval: false,
      scopes: ["project:read"],
      execute: (_context, input) => ({
        path: input.path,
        content: "# Open Lagrange\n\nDurable reconciliation around non-deterministic cognitive functions.",
      }),
    }),
    capability({
      name: "draft_readme_summary",
      description: "Create a short README summary from trusted input.",
      input_schema: DraftArguments,
      output_schema: DraftResult,
      risk_level: "read",
      side_effect_kind: "none",
      requires_approval: false,
      scopes: ["project:summarize"],
      execute: (_context, input) => ({
        title: input.title,
        content: `Open Lagrange is a TypeScript framework that validates cognitive artifacts, applies policy, and executes trusted endpoint intents through durable reconciliation. ${input.source_summary}`,
      }),
    }),
    capability({
      name: "write_note",
      description: "Simulate a sandboxed workspace write.",
      input_schema: WriteArguments,
      output_schema: WriteResult,
      risk_level: "write",
      side_effect_kind: "filesystem_write",
      requires_approval: true,
      scopes: ["project:write"],
      execute: (_context, input) => ({
        path: input.path,
        bytes_written: input.content.length,
        simulated: true,
      }),
    }),
  ],
};

function capability<Input, Output>(input: {
  readonly name: string;
  readonly description: string;
  readonly input_schema: z.ZodType<Input>;
  readonly output_schema: z.ZodType<Output>;
  readonly risk_level: CapabilityDefinition<Input, Output>["descriptor"]["risk_level"];
  readonly side_effect_kind: CapabilityDefinition<Input, Output>["descriptor"]["side_effect_kind"];
  readonly requires_approval: boolean;
  readonly scopes: readonly string[];
  readonly execute: CapabilityDefinition<Input, Output>["execute"];
}): CapabilityDefinition {
  return {
    descriptor: {
      capability_id: `${PACK_ID}.${input.name}`,
      pack_id: PACK_ID,
      name: input.name,
      description: input.description,
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: input.risk_level,
      side_effect_kind: input.side_effect_kind,
      requires_approval: input.requires_approval,
      idempotency_mode: input.risk_level === "read" ? "recommended" : "required",
      timeout_ms: 30_000,
      max_attempts: 1,
      scopes: [...input.scopes],
      tags: ["mock"],
      examples: [],
    },
    input_schema: input.input_schema as z.ZodType<unknown>,
    output_schema: input.output_schema as z.ZodType<unknown>,
    execute: (context, value) => input.execute(context, input.input_schema.parse(value)),
  };
}
