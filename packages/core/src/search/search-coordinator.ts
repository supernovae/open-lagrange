import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { artifacts } from "@open-lagrange/capability-sdk/primitives";
import { stableHash } from "../util/hash.js";
import { SearchPlan, type SearchPlan as SearchPlanType } from "./search-plan.js";
import type { SearchProvider } from "./search-provider.js";
import { SearchProviderRegistry } from "./search-provider-registry.js";
import { assertSearchPolicy } from "./search-policy.js";
import { SearchError, searchProviderNotConfigured } from "./search-errors.js";
import { SearchResultSet, type SearchProviderCall, type SearchResultSet as SearchResultSetType } from "./search-result-set.js";
import type { SourceCandidate } from "./source-types.js";

export interface SearchCoordinatorOptions {
  readonly context: PrimitiveContext;
  readonly registry: SearchProviderRegistry;
  readonly allow_fixture?: boolean;
}

export class SearchCoordinator {
  constructor(private readonly options: SearchCoordinatorOptions) {}

  async execute(rawPlan: SearchPlanType, input: { readonly urls?: readonly string[] } = {}): Promise<SearchResultSetType> {
    const started = Date.now();
    const plan = SearchPlan.parse(rawPlan);
    const providers = await this.chooseProviders(plan, input.urls ?? []);
    assertSearchPolicy({ plan, providers, allow_fixture: this.options.allow_fixture === true });
    const calls: SearchProviderCall[] = [];
    const warnings: string[] = [];
    const candidates: SourceCandidate[] = [];
    let providerCalls = 0;
    for (const provider of providers) {
      if (providerCalls >= plan.limits.max_provider_calls) break;
      if (!(await provider.isConfigured())) {
        calls.push({ provider_id: provider.provider_id, provider_kind: provider.kind, query: plan.queries[0] ?? plan.topic, status: "skipped", result_count: 0, error_code: "SEARCH_PROVIDER_NOT_CONFIGURED", message: "Provider is not configured." });
        continue;
      }
      for (const query of plan.queries) {
        if (providerCalls >= plan.limits.max_provider_calls || Date.now() - started > plan.limits.max_search_duration_ms) break;
        providerCalls += 1;
        try {
          const output = await provider.search({
            query,
            topic: plan.topic,
            max_results: plan.limits.max_results_per_query,
            domains_allowlist: plan.domains_allowlist,
            domains_denylist: plan.domains_denylist,
            source_type_preferences: plan.source_type_preferences,
            urls: [...(input.urls ?? [])],
          });
          candidates.push(...output.candidates);
          warnings.push(...output.warnings);
          calls.push({ provider_id: provider.provider_id, provider_kind: provider.kind, query, status: "success", result_count: output.candidates.length });
          if (plan.stop_conditions.stop_after_first_provider_with_results && candidates.length >= plan.stop_conditions.min_results) break;
        } catch (error) {
          const code = error instanceof SearchError ? error.code : "SEARCH_EXECUTION_FAILED";
          calls.push({ provider_id: provider.provider_id, provider_kind: provider.kind, query, status: "failed", result_count: 0, error_code: code, message: error instanceof Error ? error.message : "Search provider failed." });
        }
      }
      if (plan.stop_conditions.stop_after_first_provider_with_results && candidates.length >= plan.stop_conditions.min_results) break;
    }
    if (candidates.length === 0 && providers.every((provider) => provider.mode === "live")) {
      throw searchProviderNotConfigured("No configured live search provider returned source candidates. Configure SearXNG, provide explicit URLs, or run fixture mode.");
    }
    const filtered = filterCandidates(candidates, plan);
    const deduped = dedupeCandidates(filtered);
    const selected = deduped.slice(0, plan.limits.max_sources_to_fetch);
    const resultSet = SearchResultSet.parse({
      search_result_set_id: `search_result_set_${stableHash({ plan, selected }).slice(0, 16)}`,
      search_plan_id: plan.search_plan_id,
      topic: plan.topic,
      mode: providers.some((provider) => provider.mode === "fixture") ? "fixture" : providers.some((provider) => provider.mode === "test") ? "test" : "live",
      provider_calls: calls,
      candidates: deduped,
      selected_candidates: selected,
      deduped_count: filtered.length - deduped.length,
      filtered_count: candidates.length - filtered.length,
      warnings: [...new Set(warnings)],
    });
    const artifact_id = await this.recordArtifact(resultSet);
    return SearchResultSet.parse({ ...resultSet, artifact_id });
  }

  private async chooseProviders(plan: SearchPlanType, urls: readonly string[]): Promise<readonly SearchProvider[]> {
    if (urls.length > 0) return [this.options.registry.get("manual-urls")].filter((provider): provider is SearchProvider => Boolean(provider));
    const all = this.options.registry.list().filter((provider) => provider.kind !== "manual_urls");
    if (plan.provider_preferences.length === 0) return all.filter((provider) => provider.mode === (this.options.allow_fixture ? "fixture" : "live"));
    const preferred = plan.provider_preferences.flatMap((preference) =>
      all.filter((provider) =>
        (preference.provider_id ? provider.provider_id === preference.provider_id : true)
        && (preference.kind ? provider.kind === preference.kind : true)
      )
    );
    return [...new Map(preferred.map((provider) => [provider.provider_id, provider])).values()];
  }

  private async recordArtifact(resultSet: SearchResultSetType): Promise<string> {
    const artifact_id = `source_search_results_${stableHash(resultSet).slice(0, 16)}`;
    await artifacts.write(this.options.context, {
      artifact_id,
      kind: "source_search_results",
      title: `Search results for ${resultSet.topic}`,
      summary: `${resultSet.selected_candidates.length} selected source candidate(s) from ${resultSet.provider_calls.length} provider call(s).`,
      content: { ...resultSet, artifact_id },
      validation_status: "pass",
      redaction_status: "redacted",
      metadata: {
        source_mode: resultSet.mode,
        execution_mode: resultSet.mode,
        live: resultSet.mode === "live",
        provider_ids: [...new Set(resultSet.provider_calls.map((call) => call.provider_id))],
        ...(resultSet.mode === "fixture" ? { fixture_set: "research-brief-demo", mode_warning: "Generated from deterministic checked-in sources, not live web results." } : {}),
      },
    });
    return artifact_id;
  }
}

function filterCandidates(candidates: readonly SourceCandidate[], plan: SearchPlanType): SourceCandidate[] {
  const allow = new Set(plan.domains_allowlist.map((domain) => domain.toLowerCase()));
  const deny = new Set(plan.domains_denylist.map((domain) => domain.toLowerCase()));
  return candidates.filter((candidate) => {
    const domain = candidate.domain.toLowerCase();
    if (deny.has(domain)) return false;
    if (allow.size > 0 && !allow.has(domain)) return false;
    return true;
  });
}

function dedupeCandidates(candidates: readonly SourceCandidate[]): SourceCandidate[] {
  const seen = new Set<string>();
  const output: SourceCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizedUrl(candidate.url);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}
