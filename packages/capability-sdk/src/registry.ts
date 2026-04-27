import { CapabilitySdkError } from "./errors.js";
import { finalizeDescriptor, stableHash } from "./descriptor.js";
import { executeDefinition } from "./executor.js";
import { PackManifest, type CapabilityDefinition, type CapabilityDescriptor, type CapabilityExecutionResult, type CapabilityFilter, type CapabilityPack, type PackExecutionContext, type RiskLevel } from "./types.js";

const RISK_ORDER: Record<RiskLevel, number> = {
  read: 0,
  write: 1,
  external_side_effect: 2,
  destructive: 3,
};

export interface CapabilityRef {
  readonly capability_id?: string;
  readonly pack_id?: string;
  readonly name?: string;
}

export interface CapabilitySnapshotLike {
  readonly snapshot_id: string;
  readonly created_at: string;
  readonly capabilities_hash: string;
  readonly capabilities: readonly CapabilityDescriptor[];
}

export class PackRegistry {
  private readonly packs = new Map<string, CapabilityPack>();
  private readonly capabilities = new Map<string, { readonly pack: CapabilityPack; readonly definition: CapabilityDefinition; readonly descriptor: CapabilityDescriptor }>();

  registerPack(pack: CapabilityPack): this {
    const manifest = PackManifest.parse(pack.manifest);
    if (this.packs.has(manifest.pack_id)) {
      throw new CapabilitySdkError(`Duplicate pack ID: ${manifest.pack_id}`, "DUPLICATE_PACK_ID", { pack_id: manifest.pack_id });
    }
    const nextCapabilities = pack.capabilities.map((definition) => {
      const descriptor = finalizeDescriptor(definition);
      if (descriptor.pack_id !== manifest.pack_id) {
        throw new CapabilitySdkError("Capability pack ID does not match manifest", "INVALID_DESCRIPTOR", { capability_id: descriptor.capability_id });
      }
      if (this.capabilities.has(descriptor.capability_id)) {
        throw new CapabilitySdkError(`Duplicate capability ID: ${descriptor.capability_id}`, "DUPLICATE_CAPABILITY_ID", { capability_id: descriptor.capability_id });
      }
      return { definition, descriptor };
    });
    this.packs.set(manifest.pack_id, pack);
    for (const item of nextCapabilities) {
      this.capabilities.set(item.descriptor.capability_id, { pack, definition: item.definition, descriptor: item.descriptor });
    }
    return this;
  }

  getPack(packId: string): CapabilityPack | undefined {
    return this.packs.get(packId);
  }

  listPacks(): readonly CapabilityPack[] {
    return [...this.packs.values()];
  }

  listCapabilities(filter: CapabilityFilter = {}): readonly CapabilityDescriptor[] {
    return [...this.capabilities.values()]
      .map((item) => item.descriptor)
      .filter((descriptor) => matchesFilter(descriptor, this.packs.get(descriptor.pack_id), filter))
      .sort((left, right) => left.capability_id.localeCompare(right.capability_id));
  }

  resolveCapability(ref: CapabilityRef): CapabilityDescriptor | undefined {
    if (ref.capability_id) return this.capabilities.get(ref.capability_id)?.descriptor;
    return [...this.capabilities.values()].find((item) =>
      item.descriptor.pack_id === ref.pack_id && item.descriptor.name === ref.name,
    )?.descriptor;
  }

  createCapabilitySnapshot(filter: CapabilityFilter & { readonly now: string }): CapabilitySnapshotLike {
    const capabilities = this.listCapabilities(filter);
    const capabilities_hash = stableHash(capabilities);
    return {
      snapshot_id: `caps_${stableHash({ capabilities_hash, now: filter.now }).slice(0, 24)}`,
      created_at: filter.now,
      capabilities_hash,
      capabilities,
    };
  }

  verifyCapabilityDigest(ref: CapabilityRef, digest: string): boolean {
    return this.resolveCapability(ref)?.capability_digest === digest;
  }

  async executeCapability(ref: CapabilityRef, input: unknown, context: PackExecutionContext): Promise<CapabilityExecutionResult> {
    const descriptor = this.resolveCapability(ref);
    if (!descriptor) {
      throw new CapabilitySdkError("Unknown capability", "UNKNOWN_CAPABILITY", { ref });
    }
    const entry = this.capabilities.get(descriptor.capability_id);
    if (!entry) {
      throw new CapabilitySdkError("Capability definition missing", "UNKNOWN_CAPABILITY", { capability_id: descriptor.capability_id });
    }
    if (descriptor.idempotency_mode === "required" && !context.idempotency_key.trim()) {
      throw new CapabilitySdkError("Missing idempotency key", "MISSING_IDEMPOTENCY_KEY", { capability_id: descriptor.capability_id });
    }
    return executeDefinition(entry.definition, context, input);
  }
}

export function createPackRegistry(): PackRegistry {
  return new PackRegistry();
}

function matchesFilter(descriptor: CapabilityDescriptor, pack: CapabilityPack | undefined, filter: CapabilityFilter): boolean {
  if (filter.trust_levels && pack && !filter.trust_levels.includes(pack.manifest.trust_level)) return false;
  if (filter.max_risk_level && RISK_ORDER[descriptor.risk_level] > RISK_ORDER[filter.max_risk_level]) return false;
  if (filter.allowed_capabilities && filter.allowed_capabilities.length > 0) {
    const keys = [descriptor.capability_id, descriptor.name, `${descriptor.pack_id}.${descriptor.name}`];
    if (!keys.some((key) => filter.allowed_capabilities?.includes(key))) return false;
  }
  if (filter.allowed_scopes && filter.allowed_scopes.length > 0) {
    if (!descriptor.scopes.some((scope) => filter.allowed_scopes?.includes(scope))) return false;
  }
  if (filter.denied_scopes && descriptor.scopes.some((scope) => filter.denied_scopes?.includes(scope))) return false;
  return true;
}
