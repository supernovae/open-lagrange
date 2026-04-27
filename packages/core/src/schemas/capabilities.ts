import { z } from "zod";
import { deterministicSnapshotId } from "../ids/deterministic-ids.js";
import { stableHash } from "../util/hash.js";

export const RiskLevel = z.enum([
  "read",
  "write",
  "destructive",
  "external_side_effect",
]);

export const JsonSchemaLike = z.record(z.string(), z.unknown());

export const CapabilityDescriptor = z.object({
  endpoint_id: z.string().min(1),
  capability_name: z.string().min(1),
  description: z.string(),
  input_schema: JsonSchemaLike,
  output_schema: JsonSchemaLike.optional(),
  risk_level: RiskLevel,
  requires_approval: z.boolean(),
  capability_digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const CapabilitySnapshot = z.object({
  snapshot_id: z.string().min(1),
  created_at: z.string().datetime(),
  capabilities_hash: z.string().regex(/^[a-f0-9]{64}$/),
  capabilities: z.array(CapabilityDescriptor).readonly(),
}).strict();

export type RiskLevel = z.infer<typeof RiskLevel>;
export type JsonSchemaLike = z.infer<typeof JsonSchemaLike>;
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptor>;
export type CapabilitySnapshot = z.infer<typeof CapabilitySnapshot>;

export interface CapabilityDescriptorInput {
  readonly endpoint_id: string;
  readonly capability_name: string;
  readonly description: string;
  readonly input_schema: JsonSchemaLike;
  readonly output_schema?: JsonSchemaLike;
  readonly risk_level: RiskLevel;
  readonly requires_approval: boolean;
}

export function capabilityDigest(input: CapabilityDescriptorInput): string {
  return stableHash({
    endpoint_id: input.endpoint_id,
    capability_name: input.capability_name,
    input_schema: input.input_schema,
    output_schema: input.output_schema,
    risk_level: input.risk_level,
    requires_approval: input.requires_approval,
  });
}

export function buildCapabilitySnapshot(
  inputs: readonly CapabilityDescriptorInput[],
  now: string,
): CapabilitySnapshot {
  const capabilities = inputs
    .map((input) => ({ ...input, capability_digest: capabilityDigest(input) }))
    .sort((left, right) =>
      `${left.endpoint_id}.${left.capability_name}`.localeCompare(`${right.endpoint_id}.${right.capability_name}`),
    );
  const capabilities_hash = stableHash(capabilities);
  return CapabilitySnapshot.parse({
    snapshot_id: deterministicSnapshotId({ capabilities_hash, now }),
    created_at: now,
    capabilities_hash,
    capabilities,
  });
}
