import { structuredError } from "./records.js";
import type { CapabilityDescriptor, CapabilitySnapshot } from "../schemas/capabilities.js";
import type { ExecutionIntent, StructuredError } from "../schemas/open-cot.js";

export function validateIntentForSnapshot(input: {
  readonly intent: ExecutionIntent;
  readonly snapshot: CapabilitySnapshot;
  readonly task_id: string;
  readonly now: string;
}): { readonly ok: true; readonly capability: CapabilityDescriptor } | { readonly ok: false; readonly error: StructuredError } {
  const { intent, snapshot, task_id, now } = input;
  if (intent.snapshot_id !== snapshot.snapshot_id) {
    return { ok: false, error: structuredError({ code: "SNAPSHOT_MISMATCH", message: "Intent references a different snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  const endpointExists = snapshot.capabilities.some((capability) => capability.endpoint_id === intent.endpoint_id);
  if (!endpointExists) {
    return { ok: false, error: structuredError({ code: "UNKNOWN_MCP_SERVER", message: "Requested endpoint is not in snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  const capability = snapshot.capabilities.find(
    (entry) => entry.endpoint_id === intent.endpoint_id && entry.capability_name === intent.capability_name,
  );
  if (!capability) {
    return { ok: false, error: structuredError({ code: "UNKNOWN_CAPABILITY", message: "Requested capability is not in snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  if (capability.capability_digest !== intent.capability_digest) {
    return { ok: false, error: structuredError({ code: "CAPABILITY_DIGEST_MISMATCH", message: "Capability digest does not match snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  if (capability.risk_level !== intent.risk_level || capability.requires_approval !== intent.requires_approval) {
    return { ok: false, error: structuredError({ code: "SCHEMA_VALIDATION_FAILED", message: "Intent risk metadata does not match snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  const argumentValidation = validateJsonLikeArguments(capability.input_schema, intent.arguments);
  if (!argumentValidation.ok) {
    return { ok: false, error: structuredError({ code: "SCHEMA_VALIDATION_FAILED", message: argumentValidation.message, now, intent_id: intent.intent_id, task_id }) };
  }
  return { ok: true, capability };
}

export function validateJsonLikeArguments(
  schema: Record<string, unknown>,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
