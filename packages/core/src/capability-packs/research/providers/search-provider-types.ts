import type { ResearchSearchInput, ResearchSearchOutput } from "../schemas.js";

export interface SearchProvider {
  readonly provider_id: string;
  readonly mode: "live" | "fixture";
  readonly isConfigured: () => Promise<boolean>;
  readonly search: (input: ResearchSearchInput) => Promise<ResearchSearchOutput>;
}

export class SearchProviderNotConfiguredError extends Error {
  readonly code = "SEARCH_PROVIDER_NOT_CONFIGURED";

  constructor(message = "Live search provider is not configured.") {
    super(message);
    this.name = "SearchProviderNotConfiguredError";
  }
}
