import { z } from "zod";
import type { CapabilityDescriptor, CapabilitySnapshot } from "../schemas/capabilities.js";
import type { SkillFrame } from "./skill-frame.js";

export const CapabilityMatch = z.object({
  capability_ref: z.string().min(1),
  endpoint_id: z.string().min(1),
  capability_name: z.string().min(1),
  pack_id: z.string().min(1),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
}).strict();

export const CapabilityMatchResult = z.object({
  matches: z.array(CapabilityMatch),
  missing_capabilities: z.array(z.string()),
}).strict();

export type CapabilityMatch = z.infer<typeof CapabilityMatch>;
export type CapabilityMatchResult = z.infer<typeof CapabilityMatchResult>;

export function matchCapabilitiesForSkill(input: {
  readonly frame: SkillFrame;
  readonly capability_snapshot: CapabilitySnapshot;
}): CapabilityMatchResult {
  const requirements = capabilityRequirements(input.frame);
  const matches: CapabilityMatch[] = [];
  const missing: string[] = [];
  for (const requirement of requirements) {
    const match = bestMatch(requirement, input.capability_snapshot.capabilities);
    if (!match) {
      missing.push(requirement.description);
      continue;
    }
    matches.push(match);
  }
  return CapabilityMatchResult.parse({ matches: uniqueMatches(matches), missing_capabilities: [...new Set(missing)] });
}

export function capabilityRequirements(frame: SkillFrame): readonly { readonly key: string; readonly description: string; readonly hints: readonly string[] }[] {
  const text = [
    frame.interpreted_goal,
    ...frame.required_inputs,
    ...frame.expected_outputs,
    ...frame.side_effects,
  ].join("\n").toLowerCase();
  const requirements: Array<{ key: string; description: string; hints: readonly string[] } | undefined> = [
    text.includes("research") || text.includes("source") || text.includes("citation") || text.includes("cited") || text.includes("brief") ? {
      key: "research",
      description: "Search, fetch, cite, or summarize sources through existing research capabilities.",
      hints: ["research", "source", "citation", "brief", "search"],
    } : undefined,
    text.includes("repository") || text.includes("repo") || text.includes("file") || text.includes("read") ? {
      key: "inspect",
      description: "Read or inspect workflow context through an existing capability.",
      hints: ["list", "read", "search", "repo", "repository"],
    } : undefined,
    text.includes("patch") || text.includes("modify") || text.includes("write") || frame.risk_level === "write" || frame.risk_level === "destructive" ? {
      key: "write",
      description: "Apply a bounded write through an existing capability.",
      hints: ["patch", "apply", "write", "repo"],
    } : undefined,
    text.includes("verify") || text.includes("test") || text.includes("check") ? {
      key: "verify",
      description: "Run allowlisted verification through an existing capability.",
      hints: ["verify", "verification", "test"],
    } : undefined,
    text.includes("review") || text.includes("report") ? {
      key: "review",
      description: "Create a review or report artifact through an existing capability.",
      hints: ["review", "report"],
    } : undefined,
  ];
  const filtered = requirements.filter((item): item is { key: string; description: string; hints: readonly string[] } => Boolean(item));
  return filtered.length > 0 ? filtered : [{
    key: "read",
    description: "Read context through an existing capability.",
    hints: ["read", "search", "list"],
  }];
}

function bestMatch(
  requirement: { readonly description: string; readonly hints: readonly string[] },
  capabilities: readonly CapabilityDescriptor[],
): CapabilityMatch | undefined {
  const scored = capabilities
    .map((capability) => ({ capability, score: scoreCapability(capability, requirement.hints) }))
    .filter((item) => item.score >= 0.35)
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best) return undefined;
  return CapabilityMatch.parse({
    capability_ref: `${best.capability.endpoint_id}.${best.capability.capability_name}`,
    endpoint_id: best.capability.endpoint_id,
    capability_name: best.capability.capability_name,
    pack_id: best.capability.endpoint_id,
    score: best.score,
    reasons: [`Matched hints: ${requirement.hints.join(", ")}`],
  });
}

function scoreCapability(capability: CapabilityDescriptor, hints: readonly string[]): number {
  const haystack = `${capability.endpoint_id} ${capability.capability_name} ${capability.description}`.toLowerCase();
  const hits = hints.filter((hint) => haystack.includes(hint.toLowerCase())).length;
  return Math.min(1, hits / Math.max(1, Math.min(3, hints.length)));
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
