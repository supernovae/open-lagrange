import type { CapabilityPack } from "@open-lagrange/capability-sdk";
import { packRegistry } from "../capability-registry/registry.js";

export interface PackValidationResult {
  readonly pack_id: string;
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const RISKY = new Set(["write", "destructive", "external_side_effect"]);

export function validateRegisteredPack(packId: string): PackValidationResult {
  const pack = packRegistry.getPack(packId);
  if (!pack) return { pack_id: packId, ok: false, errors: [`Pack not found: ${packId}`], warnings: [] };
  return validateCapabilityPack(pack);
}

export function validateCapabilityPack(pack: CapabilityPack): PackValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  if (!pack.manifest.pack_id.trim()) errors.push("Pack manifest is missing pack_id.");
  if (!pack.manifest.name.trim()) errors.push("Pack manifest is missing name.");
  if (pack.capabilities.length === 0) warnings.push("Pack does not expose capabilities.");
  for (const capability of pack.capabilities) {
    const descriptor = capability.descriptor;
    if (seen.has(descriptor.name)) errors.push(`Duplicate capability name: ${descriptor.name}`);
    seen.add(descriptor.name);
    if (!descriptor.input_schema || Object.keys(descriptor.input_schema).length === 0) errors.push(`${descriptor.name} is missing input schema.`);
    if (!descriptor.output_schema || Object.keys(descriptor.output_schema).length === 0) errors.push(`${descriptor.name} is missing output schema.`);
    if (descriptor.pack_id !== pack.manifest.pack_id) errors.push(`${descriptor.name} pack_id does not match manifest.`);
    if (RISKY.has(descriptor.risk_level) && !descriptor.requires_approval) errors.push(`${descriptor.name} must require approval for ${descriptor.risk_level}.`);
    if (descriptor.side_effect_kind !== "none" && descriptor.risk_level === "read" && descriptor.side_effect_kind !== "filesystem_read" && descriptor.side_effect_kind !== "network_read") {
      warnings.push(`${descriptor.name} has read risk with side effect ${descriptor.side_effect_kind}.`);
    }
  }
  return { pack_id: pack.manifest.pack_id, ok: errors.length === 0, errors, warnings };
}
