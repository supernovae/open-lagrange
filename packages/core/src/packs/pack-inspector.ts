import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { CapabilityDescriptor, CapabilityPack } from "@open-lagrange/capability-sdk";
import { packRegistry } from "../capability-registry/registry.js";
import { readInstalledPackRegistry } from "../skills/generated-pack/pack-install.js";

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
  readonly required_secret_refs: readonly string[];
  readonly oauth_requirements: readonly unknown[];
  readonly network_requirements: unknown;
  readonly filesystem_requirements: unknown;
  readonly side_effects: readonly string[];
  readonly approval_requirements: readonly string[];
  readonly load_status?: string;
  readonly capabilities: readonly PackCapabilityInspection[];
}

export function listInspectablePacks(homeDir?: string): readonly Pick<PackInspection, "pack_id" | "name" | "version" | "description">[] {
  const registered = packRegistry.listPacks().map((pack) => ({
    pack_id: pack.manifest.pack_id,
    name: pack.manifest.name,
    version: pack.manifest.version,
    description: pack.manifest.description,
  }));
  const installed = readInstalledPackRegistry(homeDir).packs.map((pack) => ({
    pack_id: pack.pack_id,
    name: pack.name,
    version: pack.version,
    description: `Installed generated pack from ${pack.source_path}`,
  }));
  return [...registered, ...installed].sort((left, right) => left.pack_id.localeCompare(right.pack_id));
}

export function inspectPack(packId: string, homeDir?: string): PackInspection | undefined {
  if (existsSync(packId)) return inspectPackPath(packId);
  const installed = readInstalledPackRegistry(homeDir).packs.find((pack) => pack.pack_id === packId);
  if (installed) {
    return {
      pack_id: installed.pack_id,
      name: installed.name,
      version: installed.version,
      description: `Installed generated pack from ${installed.source_path}`,
      trust_level: installed.trust_level,
      runtime_kind: "local_trusted",
      required_scopes: installed.required_scopes,
      provided_scopes: installed.required_scopes,
      required_secret_refs: installed.required_secret_refs,
      oauth_requirements: installed.oauth_requirements,
      network_requirements: installed.network_requirements,
      filesystem_requirements: installed.filesystem_requirements,
      side_effects: installed.side_effects,
      approval_requirements: installed.approval_requirements,
      load_status: installed.load_status,
      capabilities: installed.capabilities.map((capability) => ({
        capability_id: capability,
        name: capability.split(".").at(-1) ?? capability,
        description: "Installed generated capability metadata.",
        input_schema: {},
        output_schema: {},
        risk_level: "unknown",
        side_effect_kind: "unknown",
        required_scopes: installed.required_scopes,
        required_secrets: installed.required_secret_refs,
        oauth_providers: installed.oauth_requirements.map((item) => String((item as { provider_id?: unknown }).provider_id ?? item)),
        allowed_hosts: arrayPolicy((installed.network_requirements as { allowed_hosts?: unknown } | undefined)?.allowed_hosts),
        approval_required: installed.approval_requirements.length > 0,
        primitive_usage: [],
      })),
    };
  }
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
    required_secret_refs: arrayPolicy(pack.manifest.default_policy.required_secrets),
    oauth_requirements: arrayPolicy(pack.manifest.default_policy.oauth_providers),
    network_requirements: { allowed_hosts: arrayPolicy(pack.manifest.default_policy.allowed_hosts) },
    filesystem_requirements: pack.manifest.default_policy.filesystem ?? {},
    side_effects: arrayPolicy(pack.manifest.default_policy.side_effects),
    approval_requirements: arrayPolicy(pack.manifest.default_policy.approval_requirements),
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

function inspectPackPath(packPath: string): PackInspection | undefined {
  const manifestPath = existsSync(join(packPath, "open-lagrange.pack.yaml")) ? join(packPath, "open-lagrange.pack.yaml") : packPath;
  if (!existsSync(manifestPath)) return undefined;
  const manifest = YAML.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities as Record<string, unknown>[] : [];
  const oauth = manifest.oauth as { providers?: unknown[] } | undefined;
  const network = manifest.network as { allowed_hosts?: unknown } | undefined;
  return {
    pack_id: stringField(manifest.pack_id) ?? packPath,
    name: stringField(manifest.name) ?? packPath,
    version: stringField(manifest.version) ?? "0.1.0",
    description: stringField(manifest.description) ?? "Generated pack manifest.",
    trust_level: stringField(manifest.trust_level) ?? "review_required",
    runtime_kind: stringField(manifest.runtime_kind) ?? "local_trusted",
    required_scopes: arrayPolicy(manifest.required_scopes),
    provided_scopes: arrayPolicy(manifest.provided_scopes),
    required_secret_refs: Array.isArray(manifest.required_secret_refs) ? manifest.required_secret_refs.map((item) => stringField((item as Record<string, unknown>).ref_id) ?? stringField((item as Record<string, unknown>).name) ?? "").filter(Boolean) : [],
    oauth_requirements: Array.isArray(oauth?.providers) ? oauth.providers : [],
    network_requirements: manifest.network ?? {},
    filesystem_requirements: manifest.filesystem ?? {},
    side_effects: arrayPolicy(manifest.side_effects),
    approval_requirements: arrayPolicy(manifest.approval_requirements),
    capabilities: capabilities.map((capability) => ({
      capability_id: stringField(capability.capability_id) ?? "unknown",
      name: stringField(capability.name) ?? "unknown",
      description: stringField(capability.description) ?? "",
      input_schema: capability.input_schema ?? {},
      output_schema: capability.output_schema ?? {},
      risk_level: stringField(capability.risk_level) ?? "unknown",
      side_effect_kind: stringField(capability.side_effect_kind) ?? "unknown",
      required_scopes: arrayPolicy(capability.scopes),
      required_secrets: Array.isArray(manifest.required_secret_refs) ? manifest.required_secret_refs.map((item) => stringField((item as Record<string, unknown>).ref_id) ?? "").filter(Boolean) : [],
      oauth_providers: Array.isArray(oauth?.providers) ? oauth.providers.map((item) => String((item as { provider_id?: unknown }).provider_id ?? item)) : [],
      allowed_hosts: arrayPolicy(network?.allowed_hosts),
      approval_required: Boolean(capability.requires_approval),
      primitive_usage: arrayPolicy(capability.tags).filter((tag) => tag.startsWith("primitive:")),
    })),
  };
}

function arrayPolicy(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
