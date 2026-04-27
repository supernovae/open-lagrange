import { z } from "zod";
import { buildCapabilitySnapshot, type CapabilityDescriptor, type CapabilityDescriptorInput, type CapabilitySnapshot, type JsonSchemaLike, type RiskLevel } from "../schemas/capabilities.js";
import type { DelegationContext } from "../schemas/delegation.js";
import type { ScopedTask } from "../schemas/reconciliation.js";

export interface MockMcpCapability {
  readonly mcp_server: string;
  readonly descriptor: CapabilityDescriptorInput;
  readonly scopes: readonly string[];
  readonly argument_schema: z.ZodType<Record<string, unknown>>;
  readonly result_schema?: z.ZodType<unknown>;
}

export interface DiscoveryConstraints {
  readonly workspace_id: string;
  readonly task_scope: ScopedTask;
  readonly delegation_context: DelegationContext;
  readonly max_risk_level: RiskLevel;
  readonly now: string;
}

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

const TRUSTED_REGISTRY: readonly MockMcpCapability[] = [
  {
    mcp_server: "knowledge",
    scopes: ["project:read"],
    descriptor: {
      endpoint_id: "mcp:knowledge.search_docs",
      capability_name: "search_docs",
      description: "Search trusted project documentation.",
      input_schema: objectSchema(["query"], { query: { type: "string" } }),
      output_schema: { type: "object", required: ["results"], properties: { results: { type: "array" } } },
      risk_level: "read",
      requires_approval: false,
    },
    argument_schema: SearchArguments,
    result_schema: SearchResult,
  },
  {
    mcp_server: "workspace",
    scopes: ["project:read"],
    descriptor: {
      endpoint_id: "mcp:workspace.read_file",
      capability_name: "read_file",
      description: "Read a sandboxed mock workspace file.",
      input_schema: objectSchema(["path"], { path: { type: "string" } }),
      output_schema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } },
      risk_level: "read",
      requires_approval: false,
    },
    argument_schema: ReadArguments,
    result_schema: ReadResult,
  },
  {
    mcp_server: "writer",
    scopes: ["project:summarize"],
    descriptor: {
      endpoint_id: "mcp:writer.draft_readme_summary",
      capability_name: "draft_readme_summary",
      description: "Create a short README summary from trusted input.",
      input_schema: objectSchema(["title", "source_summary"], {
        title: { type: "string" },
        source_summary: { type: "string" },
      }),
      output_schema: { type: "object", required: ["title", "content"], properties: { title: { type: "string" }, content: { type: "string" } } },
      risk_level: "read",
      requires_approval: false,
    },
    argument_schema: DraftArguments,
    result_schema: DraftResult,
  },
  {
    mcp_server: "workspace",
    scopes: ["project:write"],
    descriptor: {
      endpoint_id: "mcp:workspace.write_note",
      capability_name: "write_note",
      description: "Simulate a sandboxed workspace write.",
      input_schema: objectSchema(["path", "content"], { path: { type: "string" }, content: { type: "string" } }),
      output_schema: { type: "object", required: ["path", "bytes_written", "simulated"], properties: { path: { type: "string" }, bytes_written: { type: "integer" }, simulated: { type: "boolean" } } },
      risk_level: "write",
      requires_approval: true,
    },
    argument_schema: WriteArguments,
    result_schema: WriteResult,
  },
];

const RISK_ORDER: Record<RiskLevel, number> = {
  read: 0,
  write: 1,
  external_side_effect: 2,
  destructive: 3,
};

export function discoverMockMcpCapabilities(input: DiscoveryConstraints): CapabilitySnapshot {
  const allowed = TRUSTED_REGISTRY.filter((entry) => {
    const capabilityKey = `${entry.descriptor.endpoint_id}.${entry.descriptor.capability_name}`;
    const matchesCapability =
      input.delegation_context.allowed_capabilities.includes(entry.descriptor.capability_name) ||
      input.delegation_context.allowed_capabilities.includes(capabilityKey) ||
      input.task_scope.allowed_capabilities.includes(entry.descriptor.capability_name) ||
      input.task_scope.allowed_capabilities.includes(capabilityKey);
    const hasScope = entry.scopes.some(
      (scope) => input.delegation_context.allowed_scopes.includes(scope) && input.task_scope.allowed_scopes.includes(scope),
    );
    const denied = entry.scopes.some((scope) => input.delegation_context.denied_scopes.includes(scope));
    const withinRisk =
      RISK_ORDER[entry.descriptor.risk_level] <= RISK_ORDER[input.max_risk_level] &&
      RISK_ORDER[entry.descriptor.risk_level] <= RISK_ORDER[input.delegation_context.max_risk_level] &&
      RISK_ORDER[entry.descriptor.risk_level] <= RISK_ORDER[input.task_scope.max_risk_level];
    return matchesCapability && hasScope && !denied && withinRisk;
  });
  return buildCapabilitySnapshot(allowed.map((entry) => entry.descriptor), input.now);
}

export function findCapability(
  snapshot: CapabilitySnapshot,
  endpointId: string,
  capabilityName: string,
): CapabilityDescriptor | undefined {
  return snapshot.capabilities.find(
    (capability) => capability.endpoint_id === endpointId && capability.capability_name === capabilityName,
  );
}

export function findTrustedCapability(endpointId: string, capabilityName: string): MockMcpCapability | undefined {
  return TRUSTED_REGISTRY.find(
    (entry) => entry.descriptor.endpoint_id === endpointId && entry.descriptor.capability_name === capabilityName,
  );
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
    if (!(key in value)) return { ok: false, message: `Missing required field: ${key}` };
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  if (schema.additionalProperties === false) {
    const extra = Object.keys(value).filter((key) => !(key in properties));
    if (extra.length > 0) return { ok: false, message: `Unexpected fields: ${extra.join(", ")}` };
  }
  for (const [key, propSchema] of Object.entries(properties)) {
    if (!(key in value) || !isRecord(propSchema)) continue;
    if (propSchema.type === "string" && typeof value[key] !== "string") return { ok: false, message: `${key} must be string` };
    if (propSchema.type === "integer" && !Number.isInteger(value[key])) return { ok: false, message: `${key} must be integer` };
    if (propSchema.type === "boolean" && typeof value[key] !== "boolean") return { ok: false, message: `${key} must be boolean` };
  }
  return { ok: true };
}

export function validateMcpResult(
  capability: CapabilityDescriptor,
  result: unknown,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const trusted = findTrustedCapability(capability.endpoint_id, capability.capability_name);
  if (!trusted?.result_schema) return { ok: true };
  const parsed = trusted.result_schema.safeParse(result);
  if (parsed.success) return { ok: true };
  return { ok: false, message: parsed.error.message };
}

function objectSchema(required: readonly string[], properties: Record<string, unknown>): JsonSchemaLike {
  return { type: "object", required: [...required], properties, additionalProperties: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
