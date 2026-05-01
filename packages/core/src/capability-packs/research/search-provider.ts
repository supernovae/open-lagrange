import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { artifacts } from "@open-lagrange/capability-sdk/primitives";
import type { ResearchSearchInput, ResearchSearchOutput } from "./schemas.js";
import { createFixtureSearchProvider } from "./providers/fixture-search-provider.js";
import { createLiveSearchProvider } from "./providers/live-search-provider.js";
import { SearchProviderNotConfiguredError } from "./providers/search-provider-types.js";

export async function searchSources(context: PrimitiveContext, input: ResearchSearchInput): Promise<ResearchSearchOutput> {
  if (input.mode === "dry_run") {
    const output: ResearchSearchOutput = {
      query: input.query,
      mode: "dry_run",
      results: [],
      warnings: ["dry_run: validated search input without querying a provider."],
    };
    await writeSearchArtifact(context, output);
    return output;
  }
  if (input.mode !== "fixture" && input.mode !== "live") {
    throw new SearchProviderNotConfiguredError(`${input.mode} search mode is not available for Research Pack search.`);
  }
  const provider = input.mode === "fixture" ? createFixtureSearchProvider() : createLiveSearchProvider();
  if (!(await provider.isConfigured())) {
    throw new SearchProviderNotConfiguredError("Live search provider is not configured. Configure a search provider, provide explicit --url sources, or run with --fixture for deterministic demo sources.");
  }
  const output = await provider.search(input);
  await writeSearchArtifact(context, output);
  return output;
}

async function writeSearchArtifact(context: PrimitiveContext, output: ResearchSearchOutput): Promise<void> {
  const artifactId = output.artifact_id ?? `source_search_results_${output.query.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40)}_${output.mode}`;
  await artifacts.write(context, {
    artifact_id: artifactId,
    kind: "source_search_results",
    title: `Search results for ${output.query}`,
    summary: `${output.results.length} source candidates for ${output.query}.`,
    content: { ...output, artifact_id: artifactId },
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: {
      source_mode: output.mode,
      execution_mode: output.mode,
      live: output.mode === "live",
      mode_warning: output.mode === "fixture" ? "Generated from deterministic checked-in sources, not live web results." : output.mode === "dry_run" ? "Dry run preview only; no live source work was performed." : undefined,
      ...(output.mode === "fixture" ? { fixture_set: "research-brief-demo" } : {}),
    },
  });
}
