import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { http } from "@open-lagrange/capability-sdk/primitives";
import { stableHash } from "../../util/hash.js";
import type { SearchProvider, SearchProviderSearchInput, SearxngSearchProviderConfig } from "../search-provider.js";
import { domainFromSearchUrl, type SourceCandidate } from "../source-types.js";

export function createSearxngProvider(context: PrimitiveContext, config: SearxngSearchProviderConfig): SearchProvider {
  return {
    provider_id: config.id,
    kind: "searxng",
    mode: "live",
    isConfigured: async () => config.enabled !== false && config.baseUrl.length > 0,
    search: async (input) => searchSearxng(context, config, input),
  };
}

async function searchSearxng(
  context: PrimitiveContext,
  config: SearxngSearchProviderConfig,
  input: SearchProviderSearchInput,
): Promise<{ readonly candidates: readonly SourceCandidate[]; readonly warnings: readonly string[] }> {
  const url = new URL("/search", config.baseUrl);
  url.searchParams.set("q", input.query);
  url.searchParams.set("format", "json");
  if (config.language) url.searchParams.set("language", config.language);
  if (config.categories && config.categories.length > 0) url.searchParams.set("categories", config.categories.join(","));
  const response = await http.fetch(searchContext(context, config.baseUrl), {
    url: url.toString(),
    timeout_ms: 8_000,
    max_bytes: 500_000,
    redirect_limit: 2,
    accepted_content_types: ["application/json", "text/json"],
  });
  const parsed = parseSearxngResponse(response.text);
  const retrieved_at = new Date().toISOString();
  const candidates = parsed.results.slice(0, input.max_results).map((result, index) => normalizeResult(config.id, result, retrieved_at, index + 1));
  return { candidates, warnings: parsed.warnings };
}

function searchContext(context: PrimitiveContext, baseUrl: string): PrimitiveContext {
  const host = new URL(baseUrl).hostname.toLowerCase();
  const allowLocal = host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1";
  if (!allowLocal) return context;
  return {
    ...context,
    policy_context: { ...context.policy_context, allow_private_network: true },
    limits: { ...context.limits, allow_private_network: true },
  };
}

function parseSearxngResponse(text: string): { readonly results: readonly Record<string, unknown>[]; readonly warnings: readonly string[] } {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { results: [], warnings: ["searxng_invalid_json"] };
  }
  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const results = Array.isArray(record.results) ? record.results.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
  if (results.length === 0) warnings.push("searxng_no_results");
  return { results, warnings };
}

function normalizeResult(providerId: string, result: Record<string, unknown>, retrieved_at: string, rank: number): SourceCandidate {
  const url = stringValue(result.url) ?? "https://example.invalid/search-result";
  const title = stringValue(result.title) ?? url;
  const snippet = stringValue(result.content) ?? stringValue(result.snippet);
  return {
    source_id: `searxng_${stableHash(url).slice(0, 16)}`,
    title,
    url,
    ...(snippet ? { snippet } : {}),
    source_type: sourceTypeForResult(result),
    retrieved_at,
    domain: domainFromSearchUrl(url),
    confidence: "medium",
    provider_id: providerId,
    provider_kind: "searxng",
    rank,
  };
}

function sourceTypeForResult(result: Record<string, unknown>): SourceCandidate["source_type"] {
  const category = stringValue(result.category)?.toLowerCase() ?? "";
  if (category.includes("news")) return "news";
  if (category.includes("it") || category.includes("science")) return "documentation";
  return "unknown";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
