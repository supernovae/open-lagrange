import type { CapabilityDescriptor, CapabilityPack } from "@open-lagrange/capability-sdk";
import { packRegistry } from "../capability-registry/registry.js";

export interface PackCapabilityInspection {
  readonly capability_id: string;
  readonly name: string;
  readonly description: string;
  readonly input_schema: unknown;
  readonly output_schema: unknown;
  readonly risk_level: string;
  readonly side_effect_kind: string;
  readonly required_scopes: readonly string[];
  readonly required_secrets: readonly string[];
  readonly oauth_providers: readonly string[];
  readonly allowed_hosts: readonly string[];
  readonly approval_required: boolean;
  readonly primitive_usage: readonly string[];
}

export interface PackInspection {
  readonly pack_id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly trust_level: string;
  readonly runtime_kind: string;
  readonly required_scopes: readonly string[];
  readonly provided_scopes: readonly string[];
  readonly capabilities: readonly PackCapabilityInspection[];
}

export function listInspectablePacks(): readonly Pick<PackInspection, "pack_id" | "name" | "version" | "description">[] {
  return packRegistry.listPacks().map((pack) => ({
    pack_id: pack.manifest.pack_id,
    name: pack.manifest.name,
    version: pack.manifest.version,
    description: pack.manifest.description,
  }));
}

export function inspectPack(packId: string): PackInspection | undefined {
  const pack = packRegistry.getPack(packId);
  if (!pack) return undefined;
  const descriptors = packRegistry.listCapabilities().filter((capability) => capability.pack_id === packId);
  return inspectCapabilityPack(pack, descriptors);
}

export function inspectCapabilityPack(pack: CapabilityPack, descriptors: readonly CapabilityDescriptor[]): PackInspection {
  return {
    pack_id: pack.manifest.pack_id,
    name: pack.manifest.name,
    version: pack.manifest.version,
    description: pack.manifest.description,
    trust_level: pack.manifest.trust_level,
    runtime_kind: pack.manifest.runtime_kind,
    required_scopes: pack.manifest.required_scopes,
    provided_scopes: pack.manifest.provided_scopes,
    capabilities: descriptors.map((descriptor) => ({
      capability_id: descriptor.capability_id,
      name: descriptor.name,
      description: descriptor.description,
      input_schema: descriptor.input_schema,
      output_schema: descriptor.output_schema,
      risk_level: descriptor.risk_level,
      side_effect_kind: descriptor.side_effect_kind,
      required_scopes: descriptor.scopes,
      required_secrets: arrayPolicy(pack.manifest.default_policy.required_secrets),
      oauth_providers: arrayPolicy(pack.manifest.default_policy.oauth_providers),
      allowed_hosts: arrayPolicy(pack.manifest.default_policy.allowed_hosts),
      approval_required: descriptor.requires_approval,
      primitive_usage: arrayPolicy(descriptor.tags).filter((tag) => tag.startsWith("primitive:")),
    })),
  };
}

function arrayPolicy(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
