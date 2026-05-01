import { stableHash } from "../../util/hash.js";
import type { SearchProvider, SearchProviderSearchInput } from "../search-provider.js";
import { domainFromSearchUrl, type SourceCandidate } from "../source-types.js";

export function createManualUrlProvider(): SearchProvider {
  return {
    provider_id: "manual-urls",
    kind: "manual_urls",
    mode: "live",
    isConfigured: async () => true,
    search: async (input) => ({ candidates: manualCandidates(input), warnings: [] }),
  };
}

function manualCandidates(input: SearchProviderSearchInput): SourceCandidate[] {
  const retrieved_at = new Date().toISOString();
  return input.urls.slice(0, input.max_results).map((url, index) => ({
    source_id: `manual_${stableHash(url).slice(0, 16)}`,
    title: url,
    url,
    snippet: `User-provided source URL for ${input.topic}.`,
    source_type: "unknown",
    retrieved_at,
    domain: domainFromSearchUrl(url),
    confidence: "high",
    provider_id: "manual-urls",
    provider_kind: "manual_urls",
    rank: index + 1,
  }));
}
