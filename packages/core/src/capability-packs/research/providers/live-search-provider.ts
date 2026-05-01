import type { ResearchSearchInput, ResearchSearchOutput } from "../schemas.js";
import type { SearchProvider } from "./search-provider-types.js";
import { SearchProviderNotConfiguredError } from "./search-provider-types.js";

export function createLiveSearchProvider(input: {
  readonly provider_id?: string;
} = {}): SearchProvider {
  return {
    provider_id: input.provider_id ?? "research.live.placeholder",
    mode: "live",
    isConfigured: async () => false,
    search: async (_input: ResearchSearchInput): Promise<ResearchSearchOutput> => {
      throw new SearchProviderNotConfiguredError("Live search provider is not configured. Configure a search provider, provide explicit --url sources, or run with --fixture for deterministic demo sources.");
    },
  };
}
