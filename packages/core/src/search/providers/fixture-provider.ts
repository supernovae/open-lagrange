import { stableHash } from "../../util/hash.js";
import { loadResearchFixtures } from "../../capability-packs/research/fixtures.js";
import type { SearchProvider, SearchProviderSearchInput } from "../search-provider.js";
import type { SourceCandidate } from "../source-types.js";

export function createFixtureProvider(): SearchProvider {
  return {
    provider_id: "research-fixture",
    kind: "fixture",
    mode: "fixture",
    isConfigured: async () => true,
    search: async (input) => ({ candidates: fixtureCandidates(input), warnings: ["fixture_mode: deterministic checked-in sources, not live web results."] }),
  };
}

function fixtureCandidates(input: SearchProviderSearchInput): SourceCandidate[] {
  const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  const retrieved_at = new Date().toISOString();
  return loadResearchFixtures().sources
    .map((source) => ({ source, score: scoreSource(source, terms) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.max_results)
    .map(({ source }, index) => ({
      source_id: source.source_id || `fixture_${stableHash(source.url).slice(0, 16)}`,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
      source_type: source.source_type ?? "unknown",
      retrieved_at,
      domain: source.domain,
      confidence: source.confidence ?? "medium",
      provider_id: "research-fixture",
      provider_kind: "fixture",
      rank: index + 1,
    }));
}

function scoreSource(source: { readonly title: string; readonly snippet: string }, terms: readonly string[]): number {
  const text = `${source.title} ${source.snippet}`.toLowerCase();
  return terms.filter((term) => text.includes(term)).length + 1;
}
