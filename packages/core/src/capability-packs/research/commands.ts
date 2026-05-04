import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createTestPackContext } from "@open-lagrange/capability-sdk";
import { createArtifactSummary, listArtifacts, registerArtifacts, showArtifact, type ArtifactSummary } from "../../artifacts/index.js";
import { packRegistry } from "../../capability-registry/registry.js";
import { createMockDelegationContext } from "../../clients/mock-delegation.js";
import { createLocalPlanArtifactStore } from "../../planning/local-plan-artifacts.js";
import { listModelRouteConfigs } from "../../evals/model-route-config.js";
import { resolveCapabilityForStep } from "../../runtime/capability-step.js";
import { runCapabilityStep } from "../../runtime/capability-step-runner.js";
import { stableHash } from "../../util/hash.js";
import { readFixtureSource } from "./fixtures.js";
import { RESEARCH_LIMITS } from "./policy.js";
import { SearchError, type SearchProviderConfig } from "../../search/index.js";
import { runResearchCreateBrief, runResearchCreateSourceSet, runResearchExportMarkdown, runResearchExtractContent, runResearchPlanSearch, runResearchSearch, runResearchSearchSources } from "./executor.js";
import { ExtractedSource as ExtractedSourceSchema } from "./schemas.js";
import type { CreateBriefOutput, ExtractedSource, SourceMode } from "./schemas.js";

export interface ResearchCommandResult {
  readonly run_id: string;
  readonly output_dir: string;
  readonly result: unknown;
  readonly artifacts: readonly ArtifactSummary[];
  readonly warnings: readonly string[];
}

export async function runResearchSearchCommand(input: {
  readonly query: string;
  readonly mode?: SourceMode;
  readonly provider_id?: string;
  readonly search_provider_configs?: readonly SearchProviderConfig[];
  readonly dry_run?: boolean;
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  const run = commandRun(input.query, input.output_dir);
  const store = artifactStore(run.output_dir);
  const mode = input.dry_run ? "dry_run" : input.mode ?? "live";
  const result = await runResearchSearch(createTestPackContext({
    recordArtifact: store.recordArtifact,
    runtime_config: { search_providers: input.search_provider_configs ?? [] },
  }), {
    query: input.query,
    mode,
    ...(input.provider_id ? { provider_id: input.provider_id } : {}),
    max_results: 5,
    freshness: "any",
  }).catch((error: unknown) => yieldedProviderResult(input.query, error));
  const artifacts = store.flush(input.index_path);
  return { run_id: run.run_id, output_dir: run.output_dir, result, artifacts, warnings: warningsFromOutput(result) };
}

export async function runResearchFetchCommand(input: {
  readonly url: string;
  readonly mode?: SourceMode;
  readonly search_provider_configs?: readonly SearchProviderConfig[];
  readonly dry_run?: boolean;
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  const run = commandRun(input.url, input.output_dir);
  const store = createLocalPlanArtifactStore({ plan_id: run.run_id, output_dir: run.output_dir });
  const mode = input.dry_run ? "dry_run" : input.mode ?? "live";
  const urlError = validateUrl(input.url);
  if (urlError) return yieldedCommand(run, input.index_path, "INVALID_URL", urlError);
  const descriptor = resolveCapabilityForStep(packRegistry, "research.fetch_source")?.descriptor;
  if (!descriptor) throw new Error("Research fetch capability is not registered.");
  const result = await runCapabilityStep({
    step_id: `${run.run_id}:fetch_source`,
    plan_id: run.run_id,
    node_id: "fetch_source",
    capability_ref: "research.fetch_source",
    capability_digest: descriptor.capability_digest,
    input: {
      url: input.url,
      mode,
      max_bytes: RESEARCH_LIMITS.max_fetch_bytes,
      timeout_ms: 8_000,
      accepted_content_types: ["text/html", "text/plain", "text/markdown", "application/xhtml+xml"],
    },
    execution_mode: mode,
    delegation_context: {
      ...createMockDelegationContext({
        goal: `Fetch ${input.url}`,
        project_id: run.run_id,
        workspace_id: "workspace-local",
        delegate_id: "open-lagrange-research-cli",
        allowed_scopes: ["project:read", "research:read"],
      }),
      allowed_capabilities: ["research.fetch_source"],
      task_run_id: run.run_id,
      max_risk_level: "read",
    },
    idempotency_key: `${run.run_id}:research.fetch_source`,
    input_artifact_refs: [],
    dry_run: mode === "dry_run",
    trace_id: `trace_${stableHash({ run: run.run_id }).slice(0, 16)}`,
  }, {
    registry: packRegistry,
    runtime_config: { artifact_store: store },
    record_artifact: store.recordArtifact,
  });
  const artifacts = store.flush(input.index_path);
  return {
    run_id: run.run_id,
    output_dir: run.output_dir,
    result,
    artifacts,
    warnings: warningsFromOutput(result.output),
  };
}

export async function runResearchBriefCommand(input: {
  readonly topic: string;
  readonly mode?: SourceMode;
  readonly provider_id?: string;
  readonly search_provider_configs?: readonly SearchProviderConfig[];
  readonly urls?: readonly string[];
  readonly dry_run?: boolean;
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  const run = commandRun(input.topic, input.output_dir);
  const store = artifactStore(run.output_dir);
  const mode = input.dry_run ? "dry_run" : input.mode ?? "live";
  const context = createTestPackContext({
    recordArtifact: store.recordArtifact,
    runtime_config: {
      search_providers: input.search_provider_configs ?? [],
      artifact_dir: run.output_dir,
      model_route: listModelRouteConfigs()[0],
      ...(mode === "fixture" ? { model_brief_generator: fixtureBriefGenerator } : {}),
    },
  });
  const supportingArtifacts: ArtifactSummary[] = [];
  if (mode === "dry_run") {
    const result = {
      status: "yielded",
      execution_mode: "dry_run",
      message: "Dry run validated research brief input without fetching sources.",
      planned_steps: input.urls && input.urls.length > 0 ? ["fetch_source", "extract_content", "create_brief", "export_markdown"] : ["search", "fetch_source", "extract_content", "create_brief", "export_markdown"],
      warnings: ["dry_run: no live source work was performed."],
    };
    const artifacts = store.flush(input.index_path);
    return { run_id: run.run_id, output_dir: run.output_dir, result, artifacts, warnings: result.warnings };
  }
  const extracted: ExtractedSource[] = [];
  let search: unknown;
  if (input.urls && input.urls.length > 0) {
    const plan = await runResearchPlanSearch(context, {
      topic: input.topic,
      objective: `Use provided URLs for ${input.topic}.`,
      max_results: 5,
      max_queries: 1,
    });
    const resultSet = await runResearchSearchSources(context, {
      search_plan: plan.search_plan,
      mode,
      urls: [...input.urls],
    });
    search = resultSet.result_set;
    for (const candidate of resultSet.result_set.selected_candidates.slice(0, 5)) {
      const url = candidate.url;
      const urlError = validateUrl(url);
      if (urlError) return yieldedCommand(run, input.index_path, "INVALID_URL", urlError);
      const fetched = await runResearchFetchCommand({
        url,
        mode,
        ...(input.search_provider_configs ? { search_provider_configs: input.search_provider_configs } : {}),
        output_dir: run.output_dir,
        ...(input.index_path ? { index_path: input.index_path } : {}),
      });
      supportingArtifacts.push(...fetched.artifacts);
      if (resultStatus(fetched.result) === "failed") return { ...fetched, run_id: run.run_id, output_dir: run.output_dir };
      const output = objectValue(fetched.result).output;
      const textArtifactId = stringValue(objectValue(output).text_artifact_id);
      const source = textArtifactId ? extractedSourceFromArtifact(showArtifact(textArtifactId, input.index_path)?.content) : undefined;
      if (source) extracted.push(source);
    }
  } else {
    search = await runResearchSearch(context, {
      query: input.topic,
      mode,
      ...(input.provider_id ? { provider_id: input.provider_id } : {}),
      max_results: 5,
      freshness: "any",
    }).catch((error: unknown) => yieldedProviderResult(input.topic, error));
    if (resultStatus(search) === "yielded") {
      const artifacts = store.flush(input.index_path);
      return { run_id: run.run_id, output_dir: run.output_dir, result: search, artifacts, warnings: warningsFromOutput(search) };
    }
    const searchOutput = search as Awaited<ReturnType<typeof runResearchSearch>>;
    for (const result of searchOutput.results.slice(0, 5)) {
      if (mode === "fixture") {
        const fixture = readFixtureSource(result.source_id);
        if (!fixture) continue;
        extracted.push(await runResearchExtractContent(context, { markdown: fixture.content, url: fixture.source.url, max_chars: 20_000 }));
        continue;
      }
      const fetched = await runResearchFetchCommand({
        url: result.url,
        mode,
        ...(input.search_provider_configs ? { search_provider_configs: input.search_provider_configs } : {}),
        output_dir: run.output_dir,
        ...(input.index_path ? { index_path: input.index_path } : {}),
      });
      supportingArtifacts.push(...fetched.artifacts);
      if (resultStatus(fetched.result) === "failed") return { ...fetched, run_id: run.run_id, output_dir: run.output_dir };
      const output = objectValue(fetched.result).output;
      const textArtifactId = stringValue(objectValue(output).text_artifact_id);
      const source = textArtifactId ? extractedSourceFromArtifact(showArtifact(textArtifactId, input.index_path)?.content) : undefined;
      if (source) extracted.push(source);
    }
  }
  if (extracted.length === 0) {
    const result = {
      status: "yielded",
      execution_mode: mode,
      message: mode === "live"
        ? "No live sources were available. Configure a search provider, provide explicit --url sources, or run --fixture for deterministic demo sources."
        : "No fixture sources matched the topic.",
      warnings: mode === "fixture" ? ["fixture_mode: deterministic checked-in sources, not live web results."] : ["SEARCH_PROVIDER_NOT_CONFIGURED"],
    };
    const artifacts = store.flush(input.index_path);
    return { run_id: run.run_id, output_dir: run.output_dir, result, artifacts, warnings: result.warnings };
  }
  const sourceSet = extracted.length > 0
    ? await runResearchCreateSourceSet(context, { topic: input.topic, sources: extracted, selection_policy: { max_sources: 5, require_diverse_domains: false } })
    : undefined;
  const brief = await runResearchCreateBrief(context, {
    topic: input.topic,
    ...(sourceSet ? { source_set_id: sourceSet.source_set_id } : {}),
    sources: extracted,
    brief_style: "standard",
    include_recommendations: true,
    max_words: 800,
  });
  const artifacts = store.flush(input.index_path);
  return { run_id: run.run_id, output_dir: run.output_dir, result: { search, source_set: sourceSet, brief }, artifacts: [...supportingArtifacts, ...artifacts], warnings: brief.warnings };
}

export async function runResearchSummarizeUrlCommand(input: {
  readonly url: string;
  readonly mode?: SourceMode;
  readonly search_provider_configs?: readonly SearchProviderConfig[];
  readonly dry_run?: boolean;
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  return runResearchBriefCommand({
    topic: input.url,
    urls: [input.url],
    mode: input.mode ?? "live",
    ...(input.search_provider_configs ? { search_provider_configs: input.search_provider_configs } : {}),
    ...(input.dry_run === undefined ? {} : { dry_run: input.dry_run }),
    ...(input.output_dir ? { output_dir: input.output_dir } : {}),
    ...(input.index_path ? { index_path: input.index_path } : {}),
  });
}

export async function runResearchExportCommand(input: {
  readonly brief_id: string;
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  const resolvedId = resolveBriefArtifactId(input.brief_id, input.index_path);
  const shown = showArtifact(resolvedId, input.index_path);
  const content = shown?.content as Partial<CreateBriefOutput> | string | undefined;
  const markdown = typeof content === "string" ? content : typeof content?.markdown === "string" ? content.markdown : undefined;
  if (!markdown) throw new Error(`Research brief artifact does not contain markdown: ${input.brief_id}`);
  const run = commandRun(input.brief_id, input.output_dir);
  const store = artifactStore(run.output_dir);
  const result = await runResearchExportMarkdown(createTestPackContext({ recordArtifact: store.recordArtifact }), {
    title: shown?.summary.title ?? input.brief_id,
    markdown,
    related_source_ids: typeof content === "object" && Array.isArray(content.source_coverage) ? content.source_coverage.map((item) => item.source_id) : [],
  });
  const artifacts = store.flush(input.index_path);
  return { run_id: run.run_id, output_dir: run.output_dir, result, artifacts, warnings: [] };
}

function fixtureBriefGenerator(input: { readonly sources: readonly ExtractedSource[] }): unknown {
  return {
    title: "Fixture research brief",
    overview: "This fixture brief uses checked-in research sources for deterministic command and test coverage.",
    key_findings: input.sources.slice(0, 4).map((source) => ({
      finding: source.excerpt,
      source_ids: [source.source_id],
      confidence: "medium",
    })),
    viewpoints: input.sources.slice(0, 3).map((source) => ({
      label: source.domain,
      summary: source.excerpt,
      source_ids: [source.source_id],
    })),
    uncertainties: ["Fixture sources are useful for testing, but live runs should use configured providers."],
    recommendations: ["Run in live mode with a configured model provider before using the brief operationally."],
  };
}

function resolveBriefArtifactId(briefIdOrArtifactId: string, indexPath?: string): string {
  if (showArtifact(briefIdOrArtifactId, indexPath)) return briefIdOrArtifactId;
  return listArtifacts(indexPath).find((artifact) =>
    artifact.kind === "research_brief" && artifact.artifact_id.includes(briefIdOrArtifactId)
  )?.artifact_id ?? briefIdOrArtifactId;
}

function commandRun(value: string, outputDir?: string): { readonly run_id: string; readonly output_dir: string } {
  const run_id = `research_${stableHash({ value, now: new Date().toISOString() }).slice(0, 16)}`;
  return { run_id, output_dir: resolve(outputDir ?? join(".open-lagrange", "research", run_id)) };
}

function artifactStore(outputDir: string) {
  const summaries: ArtifactSummary[] = [];
  return {
    async recordArtifact(artifact: unknown): Promise<void> {
      const record = artifact && typeof artifact === "object" ? artifact as Record<string, unknown> : {};
      const artifactId = typeof record.artifact_id === "string" ? record.artifact_id : `artifact_${stableHash(record).slice(0, 16)}`;
      const kind = typeof record.kind === "string" ? record.kind : "raw_log";
      const contentType = typeof record.content_type === "string" ? record.content_type : "application/json";
      const extension = contentType.includes("markdown") ? "md" : "json";
      const path = join(outputDir, `${safeFileName(artifactId)}.${extension}`);
      mkdirSync(dirname(path), { recursive: true });
      const content = record.content ?? record;
      writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
      const lineage = record.lineage && typeof record.lineage === "object" ? record.lineage as Record<string, unknown> : {};
      summaries.push(createArtifactSummary({
        artifact_id: artifactId,
        kind: kind as ArtifactSummary["kind"],
        title: typeof record.title === "string" ? record.title : artifactId,
        summary: typeof record.summary === "string" ? record.summary : `${kind} artifact`,
        path_or_uri: path,
        content_type: contentType,
        related_pack_id: "open-lagrange.research",
        produced_by_pack_id: stringValue(lineage.produced_by_pack_id),
        produced_by_capability_id: stringValue(lineage.produced_by_capability_id),
        produced_by_plan_id: stringValue(lineage.produced_by_plan_id),
        produced_by_node_id: stringValue(lineage.produced_by_node_id),
        input_artifact_refs: stringArray(lineage.input_artifact_refs),
        output_artifact_refs: stringArray(lineage.output_artifact_refs),
        source_mode: sourceMode(record),
        execution_mode: executionMode(record),
        fixture_id: stringValue(record.fixture_id) ?? stringValue(objectValue(record.metadata).fixture_id),
        fixture_set: stringValue(record.fixture_set) ?? stringValue(objectValue(record.metadata).fixture_set),
        live: booleanValue(record.live) ?? booleanValue(objectValue(record.metadata).live),
        mode_warning: stringValue(record.mode_warning) ?? stringValue(objectValue(record.metadata).mode_warning),
        validation_status: typeof record.validation_status === "string" ? record.validation_status : "not_applicable",
        redaction_status: "redacted",
      }));
    },
    flush(indexPath?: string): readonly ArtifactSummary[] {
      if (summaries.length > 0) registerArtifacts({ artifacts: summaries, ...(indexPath ? { index_path: indexPath } : {}) });
      return summaries;
    },
  };
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const output = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return output.length > 0 ? output : undefined;
}

function warningsFromOutput(output: unknown): readonly string[] {
  if (!output || typeof output !== "object") return [];
  const warnings = (output as Record<string, unknown>).warnings;
  return Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === "string") : [];
}

function yieldedProviderResult(query: string, error: unknown): unknown {
  if (error instanceof SearchError && error.code === "SEARCH_PROVIDER_NOT_CONFIGURED" || objectValue(error).code === "SEARCH_PROVIDER_NOT_CONFIGURED") {
    return {
      status: "yielded",
      execution_mode: "live",
      code: "SEARCH_PROVIDER_NOT_CONFIGURED",
      message: "Live search provider is not configured. Configure a search provider, provide explicit --url sources, or run --fixture for deterministic demo sources.",
      query,
      warnings: ["SEARCH_PROVIDER_NOT_CONFIGURED"],
    };
  }
  if (error instanceof SearchError && (error.code === "SEARCH_PROVIDER_UNAVAILABLE" || error.code === "SEARCH_EXECUTION_FAILED")) {
    return {
      status: "failed",
      execution_mode: "live",
      code: error.code,
      message: error.message,
      query,
      details: error.details,
      warnings: [error.code],
    };
  }
  throw error;
}

function yieldedCommand(run: { readonly run_id: string; readonly output_dir: string }, _indexPath: string | undefined, code: string, message: string): ResearchCommandResult {
  return {
    run_id: run.run_id,
    output_dir: run.output_dir,
    result: { status: "yielded", code, message, warnings: [code] },
    artifacts: [],
    warnings: [message],
  };
}

function resultStatus(value: unknown): string | undefined {
  const record = objectValue(value);
  return stringValue(record.status) ?? stringValue(objectValue(record.result).status);
}

function validateUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Research URL must be an absolute http or https URL.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Research URL must use http or https.";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return "Research URL must not target a local host.";
  return undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function extractedSourceFromArtifact(value: unknown): ExtractedSource | undefined {
  const content = objectValue(value).content ?? value;
  const record = objectValue(content);
  const { mode: _mode, ...clean } = record;
  const parsed = ExtractedSourceSchema.safeParse(Object.keys(record).length > 0 ? clean : content);
  return parsed.success ? parsed.data : undefined;
}

function sourceMode(record: Record<string, unknown>): SourceMode | undefined {
  const metadata = objectValue(record.metadata);
  return sourceModeValue(stringValue(record.source_mode) ?? stringValue(metadata.source_mode) ?? stringValue(metadata.mode));
}

function executionMode(record: Record<string, unknown>): SourceMode {
  const metadata = objectValue(record.metadata);
  return sourceModeValue(stringValue(record.execution_mode) ?? stringValue(metadata.execution_mode) ?? stringValue(record.source_mode) ?? stringValue(metadata.source_mode) ?? stringValue(metadata.mode)) ?? "live";
}

function sourceModeValue(value: string | undefined): SourceMode | undefined {
  if (value === "live" || value === "dry_run" || value === "fixture" || value === "mock" || value === "test") return value;
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
