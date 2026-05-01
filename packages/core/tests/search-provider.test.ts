import { describe, expect, it } from "vitest";
import { createPrimitiveContext, createTestPackContext } from "@open-lagrange/capability-sdk";
import {
  SearchCoordinator,
  SearchPlan,
  SearchProviderRegistry,
  createManualUrlProvider,
  createSearxngProvider,
} from "../src/search/index.js";
import { runResearchBriefCommand, runResearchSearchCommand } from "../src/capability-packs/research/index.js";

describe("search providers", () => {
  it("validates SearchPlan query limits", () => {
    expect(() => SearchPlan.parse({
      search_plan_id: "search_plan_too_many",
      topic: "bounded search",
      objective: "Verify query bounds.",
      queries: ["one", "two"],
      limits: { max_queries: 1 },
    })).toThrow(/max_queries/);
  });

  it("coordinator rejects unconfigured live provider paths", async () => {
    const context = primitiveContext();
    const coordinator = new SearchCoordinator({ context, registry: new SearchProviderRegistry({ context }) });

    await expect(coordinator.execute(plan("missing provider"))).rejects.toMatchObject({ code: "SEARCH_PROVIDER_NOT_CONFIGURED" });
  });

  it("ManualUrlProvider normalizes URLs", async () => {
    const provider = createManualUrlProvider();
    const output = await provider.search({
      query: "manual",
      topic: "manual",
      max_results: 2,
      urls: ["https://example.com/a", "https://docs.example.com/b"],
      domains_allowlist: [],
      domains_denylist: [],
      source_type_preferences: [],
    });

    expect(output.candidates.map((candidate) => candidate.domain)).toEqual(["example.com", "docs.example.com"]);
    expect(output.candidates[0]?.provider_kind).toBe("manual_urls");
  });

  it("SearXNG provider calls the SDK HTTP primitive", async () => {
    let calls = 0;
    const context = primitiveContext({
      fetch_impl: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          results: [
            { title: "Result A", url: "https://example.com/a", content: "Alpha" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const provider = createSearxngProvider(context, { id: "local-searxng", kind: "searxng", baseUrl: "https://search.example.test", enabled: true });
    const output = await provider.search({
      query: "open lagrange",
      topic: "open lagrange",
      max_results: 5,
      urls: [],
      domains_allowlist: [],
      domains_denylist: [],
      source_type_preferences: [],
    });

    expect(calls).toBe(1);
    expect(output.candidates[0]?.provider_id).toBe("local-searxng");
    expect(output.candidates[0]?.url).toBe("https://example.com/a");
  });

  it("fixture provider is denied without explicit fixture allowance", async () => {
    const context = primitiveContext();
    const registry = new SearchProviderRegistry({ context, allow_fixture: true });
    const coordinator = new SearchCoordinator({ context, registry, allow_fixture: false });

    await expect(coordinator.execute({
      ...plan("fixture"),
      provider_preferences: [{ kind: "fixture" }],
    })).rejects.toMatchObject({ code: "SEARCH_POLICY_DENIED" });
  });

  it("deduplicates duplicate URLs and records result artifact lineage", async () => {
    const artifacts: unknown[] = [];
    const context = primitiveContext({ artifacts });
    const coordinator = new SearchCoordinator({ context, registry: new SearchProviderRegistry({ context }) });
    const result = await coordinator.execute(plan("manual urls"), {
      urls: ["https://example.com/a#top", "https://example.com/a"],
    });

    expect(result.selected_candidates).toHaveLength(1);
    expect(result.deduped_count).toBe(1);
    expect(artifacts.some((artifact) => JSON.stringify(artifact).includes("source_search_results"))).toBe(true);
    expect(artifacts.some((artifact) => JSON.stringify(artifact).includes("manual-urls"))).toBe(true);
  });

  it("research brief with URLs works without search provider", async () => {
    const result = await runResearchBriefCommand({
      topic: "planning primitive",
      urls: ["https://example.invalid/open-lagrange/planning-primitive"],
      mode: "fixture",
    });

    expect(result.artifacts.some((artifact) => artifact.kind === "research_brief")).toBe(true);
    expect(JSON.stringify(result.result)).toContain("manual-urls");
  });

  it("research topic without provider yields clearly", async () => {
    const result = await runResearchSearchCommand({ query: "planning primitive" });

    expect((result.result as { readonly status?: string }).status).toBe("yielded");
    expect(JSON.stringify(result.result)).toContain("SEARCH_PROVIDER_NOT_CONFIGURED");
  });
});

function primitiveContext(input: {
  readonly fetch_impl?: typeof fetch;
  readonly artifacts?: unknown[];
} = {}) {
  return createPrimitiveContext(createTestPackContext({
    async recordArtifact(artifact) {
      input.artifacts?.push(artifact);
    },
  }), {
    pack_id: "open-lagrange.research",
    capability_id: "research.search_sources",
    policy_context: { allowed_http_methods: ["GET"] },
    limits: {
      default_timeout_ms: 8_000,
      default_max_bytes: 1_000_000,
      default_redirect_limit: 2,
      allowed_http_methods: ["GET"],
      allow_private_network: false,
    },
    ...(input.fetch_impl ? { fetch_impl: input.fetch_impl } : {}),
  });
}

function plan(topic: string) {
  return SearchPlan.parse({
    search_plan_id: `search_plan_${topic.replace(/[^a-z0-9]+/gi, "_")}`,
    topic,
    objective: `Find sources for ${topic}.`,
    queries: [topic],
    limits: {
      max_queries: 1,
      max_results_per_query: 5,
      max_sources_to_fetch: 5,
      max_total_fetch_bytes: 2_000_000,
      max_provider_calls: 1,
      max_search_duration_ms: 8_000,
    },
    provider_preferences: [],
    domains_allowlist: [],
    domains_denylist: [],
    source_type_preferences: [],
    stop_conditions: { min_results: 1, stop_after_first_provider_with_results: true },
  });
}
