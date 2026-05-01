import { stableHash } from "../../../util/hash.js";
import { loadResearchFixtures } from "../fixtures.js";
import type { ResearchSearchInput, ResearchSearchOutput, SourceSearchResult } from "../schemas.js";
import type { SearchProvider } from "./search-provider-types.js";

export function createFixtureSearchProvider(): SearchProvider {
  return {
    provider_id: "research.fixture",
    mode: "fixture",
    isConfigured: async () => true,
    search: async (input) => fixtureSearch(input),
  };
}

function fixtureSearch(input: ResearchSearchInput): ResearchSearchOutput {
  const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  const denied = new Set(input.domains_denylist ?? []);
  const allowed = new Set(input.domains_allowlist ?? []);
  const preferred = new Set(input.preferred_source_types ?? []);
  const results = loadResearchFixtures().sources
    .filter((source) => denied.size === 0 || !denied.has(source.domain))
    .filter((source) => allowed.size === 0 || allowed.has(source.domain))
    .map((source) => ({ source, score: scoreSource(source, terms, preferred) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.max_results)
    .map(({ source }) => ({
      source_id: source.source_id,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
      source_type: source.source_type,
      domain: source.domain,
      confidence: source.confidence,
      retrieved_at: new Date().toISOString(),
    } satisfies SourceSearchResult));
  const artifact_id = `source_search_results_${stableHash({ query: input.query, mode: "fixture", results }).slice(0, 16)}`;
  return {
    query: input.query,
    mode: "fixture",
    results,
    warnings: ["fixture_mode: deterministic checked-in sources, not live web results."],
    artifact_id,
  };
}

function scoreSource(source: { readonly title: string; readonly snippet: string; readonly source_type?: string | undefined }, terms: readonly string[], preferred: ReadonlySet<string>): number {
  const text = `${source.title} ${source.snippet}`.toLowerCase();
  const termHits = terms.filter((term) => text.includes(term)).length;
  const typeBoost = source.source_type && preferred.has(source.source_type) ? 2 : 0;
  return termHits + typeBoost + 1;
}
