import { createHash } from "node:crypto";
import { CapabilityDescriptor, type CapabilityDefinition, type CapabilityDescriptor as CapabilityDescriptorType } from "./types.js";

export function capabilityDigest(input: Omit<CapabilityDescriptorType, "capability_digest">): string {
  return stableHash({
    capability_id: input.capability_id,
    pack_id: input.pack_id,
    name: input.name,
    description: input.description,
    input_schema: input.input_schema,
    output_schema: input.output_schema,
    risk_level: input.risk_level,
    side_effect_kind: input.side_effect_kind,
    requires_approval: input.requires_approval,
    idempotency_mode: input.idempotency_mode,
    timeout_ms: input.timeout_ms,
    max_attempts: input.max_attempts,
    scopes: input.scopes,
    tags: input.tags,
    examples: input.examples,
  });
}

export function finalizeDescriptor(definition: CapabilityDefinition): CapabilityDescriptorType {
  const withoutDigest = {
    capability_id: definition.descriptor.capability_id,
    pack_id: definition.descriptor.pack_id,
    name: definition.descriptor.name,
    description: definition.descriptor.description,
    input_schema: definition.descriptor.input_schema,
    output_schema: definition.descriptor.output_schema,
    risk_level: definition.descriptor.risk_level,
    side_effect_kind: definition.descriptor.side_effect_kind,
    requires_approval: definition.descriptor.requires_approval,
    idempotency_mode: definition.descriptor.idempotency_mode,
    timeout_ms: definition.descriptor.timeout_ms,
    max_attempts: definition.descriptor.max_attempts,
    scopes: definition.descriptor.scopes,
    tags: definition.descriptor.tags,
    examples: definition.descriptor.examples,
  };
  return CapabilityDescriptor.parse({
    ...withoutDigest,
    capability_digest: capabilityDigest(withoutDigest),
  });
}

export function stableHash(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function stableStringify(input: unknown): string {
  if (input === null || typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((item) => stableStringify(item)).join(",")}]`;
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
