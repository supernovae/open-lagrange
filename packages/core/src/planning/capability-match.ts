import { z } from "zod";
import type { CapabilityDescriptor, PackRegistry } from "@open-lagrange/capability-sdk";
import type { PlanTemplate } from "./plan-template-registry.js";

export const CapabilityMatch = z.object({
  capability_ref: z.string().min(1),
  pack_id: z.string().min(1),
  capability_name: z.string().min(1),
  match_reason: z.string().min(1),
  required: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
  risk_level: z.string().min(1),
  side_effect_kind: z.string().min(1),
}).strict();

export type CapabilityMatch = z.infer<typeof CapabilityMatch>;

export function matchCapabilitiesForIntent(input: {
  readonly registry: PackRegistry;
  readonly template?: PlanTemplate;
  readonly required_kinds: readonly string[];
}): CapabilityMatch[] {
  const capabilities = input.registry.listCapabilities();
  const requiredRefs = new Set(input.template?.required_capabilities ?? []);
  const optionalRefs = new Set(input.template?.optional_capabilities ?? []);
  const direct = [...requiredRefs, ...optionalRefs].flatMap((ref) => {
    const descriptor = resolveCapability(capabilities, ref);
    return descriptor ? [matchFromDescriptor(descriptor, `Template references ${ref}.`, requiredRefs.has(ref), "high")] : [];
  });
  const inferred = input.required_kinds.flatMap((kind) => bestInferredMatch(kind, capabilities, direct));
  return uniqueMatches([...direct, ...inferred]);
}

export function missingRequiredCapabilities(input: {
  readonly registry: PackRegistry;
  readonly template: PlanTemplate;
}): string[] {
  const capabilities = input.registry.listCapabilities();
  return input.template.required_capabilities.filter((ref) => !resolveCapability(capabilities, ref));
}

function resolveCapability(capabilities: readonly CapabilityDescriptor[], ref: string): CapabilityDescriptor | undefined {
  return capabilities.find((capability) =>
    capability.capability_id === ref ||
    capability.name === ref ||
    `${capability.pack_id}.${capability.name}` === ref,
  );
}

function bestInferredMatch(kind: string, capabilities: readonly CapabilityDescriptor[], existing: readonly CapabilityMatch[]): CapabilityMatch[] {
  if (existing.some((match) => match.capability_name.includes(kind) || match.match_reason.includes(kind))) return [];
  const scored = capabilities
    .map((capability) => ({ capability, score: scoreCapability(capability, kind) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best) return [];
  const confidence = best.score >= 3 ? "high" : best.score >= 2 ? "medium" : "low";
  return [matchFromDescriptor(best.capability, `Matched intent need: ${kind}.`, false, confidence)];
}

function scoreCapability(capability: CapabilityDescriptor, kind: string): number {
  const text = `${capability.pack_id} ${capability.name} ${capability.description} ${capability.tags.join(" ")} ${JSON.stringify(capability.input_schema)} ${JSON.stringify(capability.output_schema)} ${JSON.stringify(capability.examples)}`.toLowerCase();
  const words = kind.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.filter((word) => text.includes(word)).length;
}

function matchFromDescriptor(
  descriptor: CapabilityDescriptor,
  match_reason: string,
  required: boolean,
  confidence: CapabilityMatch["confidence"],
): CapabilityMatch {
  return CapabilityMatch.parse({
    capability_ref: descriptor.name,
    pack_id: descriptor.pack_id,
    capability_name: descriptor.name,
    match_reason,
    required,
    confidence,
    risk_level: descriptor.risk_level,
    side_effect_kind: descriptor.side_effect_kind,
  });
}

function uniqueMatches(matches: readonly CapabilityMatch[]): CapabilityMatch[] {
  const seen = new Set<string>();
  const output: CapabilityMatch[] = [];
  for (const match of matches) {
    if (seen.has(match.capability_ref)) continue;
    seen.add(match.capability_ref);
    output.push(match);
  }
  return output;
}
