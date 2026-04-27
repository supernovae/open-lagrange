import type { CapabilityDescriptor, CapabilityExecutionResult } from "./types.js";

export function descriptorToOpenCotCapability(descriptor: CapabilityDescriptor): {
  readonly endpoint_id: string;
  readonly capability_name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
  readonly output_schema: Record<string, unknown>;
  readonly risk_level: CapabilityDescriptor["risk_level"];
  readonly requires_approval: boolean;
  readonly capability_digest: string;
} {
  return {
    endpoint_id: descriptor.pack_id,
    capability_name: descriptor.name,
    description: descriptor.description,
    input_schema: descriptor.input_schema,
    output_schema: descriptor.output_schema,
    risk_level: descriptor.risk_level,
    requires_approval: descriptor.requires_approval,
    capability_digest: descriptor.capability_digest,
  };
}

export function capabilityResultToObservation(result: CapabilityExecutionResult): {
  readonly status: "recorded" | "error" | "skipped";
  readonly summary: string;
  readonly output?: unknown;
} {
  if (result.status === "success") return { status: "recorded", summary: "Capability execution succeeded", output: result.output };
  if (result.status === "yielded" || result.status === "requires_approval") return { status: "skipped", summary: `Capability execution ${result.status}` };
  return { status: "error", summary: "Capability execution failed", output: result.structured_errors };
}
