export class SearchError extends Error {
  constructor(
    readonly code:
      | "SEARCH_PLAN_INVALID"
      | "SEARCH_PROVIDER_NOT_CONFIGURED"
      | "SEARCH_PROVIDER_UNAVAILABLE"
      | "SEARCH_POLICY_DENIED"
      | "SEARCH_EXECUTION_FAILED",
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SearchError";
  }
}

export function searchProviderNotConfigured(message = "No live search provider is configured."): SearchError {
  return new SearchError("SEARCH_PROVIDER_NOT_CONFIGURED", message);
}
