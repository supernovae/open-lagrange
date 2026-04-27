import { findCapability, validateJsonLikeInput } from "../mcp/mock-registry.js";
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
  const capability = findCapability(snapshot, intent.endpoint_id, intent.capability_name);
  if (!capability) {
    return { ok: false, error: structuredError({ code: "UNKNOWN_CAPABILITY", message: "Requested capability is not in snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  if (capability.capability_digest !== intent.capability_digest) {
    return { ok: false, error: structuredError({ code: "CAPABILITY_DIGEST_MISMATCH", message: "Capability digest does not match snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  if (capability.risk_level !== intent.risk_level || capability.requires_approval !== intent.requires_approval) {
    return { ok: false, error: structuredError({ code: "SCHEMA_VALIDATION_FAILED", message: "Intent risk metadata does not match snapshot", now, intent_id: intent.intent_id, task_id }) };
  }
  const argumentValidation = validateJsonLikeInput(capability.input_schema, intent.arguments);
  if (!argumentValidation.ok) {
    return { ok: false, error: structuredError({ code: "SCHEMA_VALIDATION_FAILED", message: argumentValidation.message, now, intent_id: intent.intent_id, task_id }) };
  }
  return { ok: true, capability };
}
