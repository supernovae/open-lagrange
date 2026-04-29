import type { CapabilityDefinition, CapabilityDescriptor as SdkCapabilityDescriptor, PackRegistry } from "@open-lagrange/capability-sdk";
import { finalizeDescriptor } from "@open-lagrange/capability-sdk";
import type { CapabilityDescriptor } from "../schemas/capabilities.js";

export interface ResolvedCapabilityStep {
  readonly descriptor: SdkCapabilityDescriptor;
  readonly definition: CapabilityDefinition;
}

export function resolveCapabilityForStep(registry: PackRegistry, capabilityRef: string): ResolvedCapabilityStep | undefined {
  const descriptor = registry.resolveCapability({ capability_id: capabilityRef })
    ?? registry.listCapabilities({}).find((candidate) =>
      candidate.name === capabilityRef ||
      `${candidate.pack_id}.${candidate.name}` === capabilityRef ||
      candidate.capability_id === capabilityRef,
    );
  if (!descriptor) return undefined;
  const pack = registry.getPack(descriptor.pack_id);
  const definition = pack?.capabilities.find((candidate) => finalizeDescriptor(candidate).capability_id === descriptor.capability_id);
  return definition ? { descriptor, definition } : undefined;
}

export function sdkDescriptorToPolicyCapability(descriptor: SdkCapabilityDescriptor): CapabilityDescriptor & { readonly side_effect_kind: string } {
  return {
    endpoint_id: descriptor.pack_id,
    capability_name: descriptor.name,
    description: descriptor.description,
    input_schema: descriptor.input_schema,
    output_schema: descriptor.output_schema,
    risk_level: descriptor.risk_level,
    requires_approval: descriptor.requires_approval,
    capability_digest: descriptor.capability_digest,
    side_effect_kind: descriptor.side_effect_kind,
  };
}
