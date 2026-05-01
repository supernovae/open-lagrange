import type { SearchPlan } from "./search-plan.js";
import type { SearchProvider } from "./search-provider.js";
import { SearchError } from "./search-errors.js";

export function assertSearchPolicy(input: {
  readonly plan: SearchPlan;
  readonly providers: readonly SearchProvider[];
  readonly allow_fixture: boolean;
}): void {
  if (input.plan.queries.length > input.plan.limits.max_queries) {
    throw new SearchError("SEARCH_PLAN_INVALID", `SearchPlan query count exceeds max_queries ${input.plan.limits.max_queries}.`);
  }
  const fixtureProvider = input.providers.find((provider) => provider.mode === "fixture");
  if (fixtureProvider && !input.allow_fixture) {
    throw new SearchError("SEARCH_POLICY_DENIED", "Fixture search provider is not allowed without explicit fixture mode.");
  }
}
