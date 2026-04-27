import { z } from "zod";
import {
  buildCapabilitySnapshot,
  type CapabilityDescriptor,
  type CapabilityDescriptorInput,
  type CapabilitySnapshot,
  type JsonSchemaLike,
} from "../schemas/capabilities.js";

export interface McpExecutionInput {
  readonly endpoint_id: string;
  readonly capability_name: string;
  readonly arguments: Record<string, unknown>;
  readonly idempotency_key: string;
}

export interface McpExecutionOutput {
  readonly status: "ok" | "error";
  readonly result?: unknown;
  readonly message: string;
}

interface TrustedCapability {
  readonly descriptor: CapabilityDescriptorInput;
  readonly argument_schema: z.ZodType<Record<string, unknown>>;
  readonly result_schema?: z.ZodType<unknown>;
  readonly execute: (input: Record<string, unknown>) => Promise<McpExecutionOutput>;
}

const SearchArguments = z.object({
  query: z.string().min(1),
}).strict();

const SearchResult = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    summary: z.string(),
  })),
});

const ReadArguments = z.object({
  path: z.string().min(1),
}).strict();

const ReadResult = z.object({
  path: z.string(),
  content: z.string(),
});

const WriteArguments = z.object({
  path: z.string().min(1),
  content: z.string(),
}).strict();

const WriteResult = z.object({
  path: z.string(),
  bytes_written: z.number().int().min(0),
});

const TRUSTED_REGISTRY: readonly TrustedCapability[] = [
  {
    descriptor: {
      endpoint_id: "knowledge",
      capability_name: "search_docs",
      description: "Search trusted project documentation.",
      input_schema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
        additionalProperties: false,
      },
      output_schema: {
        type: "object",
        required: ["results"],
        properties: { results: { type: "array" } },
      },
      risk_level: "read",
      requires_approval: false,
    },
    argument_schema: SearchArguments,
    result_schema: SearchResult,
    execute: async (input) => ({
      status: "ok",
      message: "Search completed",
      result: {
        results: [{
          title: `Result for ${String(input.query)}`,
          url: "mcp://knowledge/search_docs/1",
          summary: "Mocked trusted documentation result.",
        }],
      },
    }),
  },
  {
    descriptor: {
      endpoint_id: "workspace",
      capability_name: "read_file",
      description: "Read a mock workspace file.",
      input_schema: {
        type: "object",
        required: ["path"],
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      output_schema: {
        type: "object",
        required: ["path", "content"],
        properties: { path: { type: "string" }, content: { type: "string" } },
      },
      risk_level: "read",
      requires_approval: false,
    },
    argument_schema: ReadArguments,
    result_schema: ReadResult,
    execute: async (input) => ({
      status: "ok",
      message: "Read completed",
      result: {
        path: String(input.path),
        content: "mock file content",
      },
    }),
  },
  {
    descriptor: {
      endpoint_id: "workspace",
      capability_name: "write_note",
      description: "Write a mock workspace note.",
      input_schema: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        additionalProperties: false,
      },
      output_schema: {
        type: "object",
        required: ["path", "bytes_written"],
        properties: {
          path: { type: "string" },
          bytes_written: { type: "integer" },
        },
      },
      risk_level: "write",
      requires_approval: true,
    },
    argument_schema: WriteArguments,
    result_schema: WriteResult,
    execute: async (input) => ({
      status: "ok",
      message: "Write completed",
      result: {
        path: String(input.path),
        bytes_written: String(input.content).length,
      },
    }),
  },
];

export async function discoverMockMcpEndpoints(): Promise<CapabilitySnapshot> {
  return buildCapabilitySnapshot(TRUSTED_REGISTRY.map((entry) => entry.descriptor));
}

export function findCapability(
  snapshot: CapabilitySnapshot,
  endpointId: string,
  capabilityName: string,
): CapabilityDescriptor | undefined {
  return snapshot.capabilities.find(
    (capability) =>
      capability.endpoint_id === endpointId &&
      capability.capability_name === capabilityName,
  );
}

export async function executeMockMcpCapability(
  input: McpExecutionInput,
): Promise<McpExecutionOutput> {
  const entry = TRUSTED_REGISTRY.find(
    (candidate) =>
      candidate.descriptor.endpoint_id === input.endpoint_id &&
      candidate.descriptor.capability_name === input.capability_name,
  );
  if (!entry) {
    return { status: "error", message: "Unknown trusted MCP endpoint" };
  }
  const parsed = entry.argument_schema.safeParse(input.arguments);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.message };
  }
  return entry.execute(parsed.data);
}

export function validateMcpResult(
  capability: CapabilityDescriptor,
  result: unknown,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const entry = TRUSTED_REGISTRY.find(
    (candidate) =>
      candidate.descriptor.endpoint_id === capability.endpoint_id &&
      candidate.descriptor.capability_name === capability.capability_name,
  );
  if (!entry?.result_schema) return { ok: true };
  const parsed = entry.result_schema.safeParse(result);
  if (parsed.success) return { ok: true };
  return { ok: false, message: parsed.error.message };
}

export function validateJsonLikeInput(
  schema: JsonSchemaLike,
  value: Record<string, unknown>,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const type = schema.type;
  if (type !== "object") return { ok: true };

  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  for (const key of required) {
    if (!(key in value)) {
      return { ok: false, message: `Missing required field: ${key}` };
    }
  }

  const additionalProperties = schema.additionalProperties;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  if (additionalProperties === false) {
    const extra = Object.keys(value).filter((key) => !(key in properties));
    if (extra.length > 0) {
      return { ok: false, message: `Unexpected fields: ${extra.join(", ")}` };
    }
  }

  for (const [key, propSchema] of Object.entries(properties)) {
    if (!(key in value) || !isRecord(propSchema)) continue;
    const expectedType = propSchema.type;
    if (expectedType === "string" && typeof value[key] !== "string") {
      return { ok: false, message: `${key} must be string` };
    }
    if (expectedType === "boolean" && typeof value[key] !== "boolean") {
      return { ok: false, message: `${key} must be boolean` };
    }
    if (expectedType === "integer" && !Number.isInteger(value[key])) {
      return { ok: false, message: `${key} must be integer` };
    }
  }
  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
