import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { policy } from "@open-lagrange/capability-sdk/primitives";
import type { ResearchFetchSourceInput, ResearchSearchInput } from "./schemas.js";

export const RESEARCH_LIMITS = {
  max_search_results: 25,
  max_fetch_bytes: 2_000_000,
  max_extracted_chars: 20_000,
  redirect_limit: 3,
} as const;

export function validateSearchPolicy(input: ResearchSearchInput): readonly string[] {
  const warnings: string[] = [];
  if (input.mode === "live") warnings.push("Live search is not configured in this phase.");
  if (input.max_results > RESEARCH_LIMITS.max_search_results) warnings.push(`Search results capped at ${RESEARCH_LIMITS.max_search_results}.`);
  return warnings;
}

export function validateFetchPolicy(context: PrimitiveContext, input: ResearchFetchSourceInput): void {
  const parsed = new URL(input.url);
  const report = policy.evaluateNetwork(context, {
    url: parsed.toString(),
    method: "GET",
    host: parsed.hostname,
  });
  if (report.decision === "deny") throw new Error(report.reason);
}
