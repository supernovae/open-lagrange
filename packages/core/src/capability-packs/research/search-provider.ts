import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { SearchCoordinator, SearchError, SearchPlan, SearchProviderRegistry, type SearchProviderConfig } from "../../search/index.js";
import { stableHash } from "../../util/hash.js";
import type { ResearchSearchInput, ResearchSearchOutput, SourceSearchResult } from "./schemas.js";

export async function searchSources(
  context: PrimitiveContext,
  input: ResearchSearchInput,
  options: { readonly provider_configs?: readonly SearchProviderConfig[] } = {},
): Promise<ResearchSearchOutput> {
  if (input.mode === "dry_run") {
    return {
      query: input.query,
      mode: "dry_run",
      results: [],
      warnings: ["dry_run: validated search input without querying a provider."],
    };
  }
  if (input.mode !== "fixture" && input.mode !== "live") {
    throw new SearchError("SEARCH_PROVIDER_NOT_CONFIGURED", `${input.mode} search mode is not available for Research Pack search.`);
  }
  const plan = SearchPlan.parse({
    search_plan_id: `search_plan_${stableHash(input).slice(0, 16)}`,
    topic: input.query,
    objective: `Find source candidates for ${input.query}.`,
    queries: [input.query],
    limits: {
      max_queries: 1,
      max_results_per_query: input.max_results,
      max_sources_to_fetch: input.max_results,
      max_total_fetch_bytes: 2_000_000,
      max_provider_calls: 1,
      max_search_duration_ms: 8_000,
    },
    provider_preferences: input.provider_id ? [{ provider_id: input.provider_id }] : [],
    domains_allowlist: input.domains_allowlist ?? [],
    domains_denylist: input.domains_denylist ?? [],
    source_type_preferences: input.preferred_source_types ?? [],
    stop_conditions: { min_results: Math.min(3, input.max_results), stop_after_first_provider_with_results: true },
  });
  const registry = new SearchProviderRegistry({
    context,
    configs: options.provider_configs ?? [],
    allow_fixture: input.mode === "fixture",
  });
  const coordinator = new SearchCoordinator({ context, registry, allow_fixture: input.mode === "fixture" });
  const resultSet = await coordinator.execute(plan).catch((error: unknown) => {
    if (error && typeof error === "object" && (error as { readonly code?: unknown }).code === "SEARCH_PROVIDER_NOT_CONFIGURED") {
      throw new SearchError("SEARCH_PROVIDER_NOT_CONFIGURED", error instanceof Error ? error.message : "Live search provider is not configured.");
    }
    throw error;
  });
  return {
    query: input.query,
    mode: input.mode,
    results: resultSet.selected_candidates.map((candidate) => ({
      source_id: candidate.source_id,
      title: candidate.title,
      url: candidate.url,
      ...(candidate.snippet ? { snippet: candidate.snippet } : {}),
      source_type: candidate.source_type,
      ...(candidate.published_at ? { published_at: candidate.published_at } : {}),
      retrieved_at: candidate.retrieved_at,
      domain: candidate.domain,
      confidence: candidate.confidence,
    } satisfies SourceSearchResult)),
    warnings: resultSet.warnings,
    ...(resultSet.artifact_id ? { artifact_id: resultSet.artifact_id } : {}),
  };
}
