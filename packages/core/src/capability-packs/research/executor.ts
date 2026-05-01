import type { PackExecutionContext } from "@open-lagrange/capability-sdk";
import { artifacts, createPrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { stableHash } from "../../util/hash.js";
import { SearchCoordinator, SearchPlan, SearchProviderRegistry, parseSearchProviderConfigs } from "../../search/index.js";
import { extractReadableContent } from "./extractor.js";
import { fetchSource } from "./fetcher.js";
import { RESEARCH_LIMITS } from "./policy.js";
import { searchSources } from "./search-provider.js";
import { createResearchBrief, exportResearchMarkdown } from "./research-brief.js";
import { createSourceSet } from "./source-set.js";
import type { CreateBriefInput, CreateSourceSetInput, ExportMarkdownInput, ExtractContentInput, ResearchFetchSourceInput, ResearchPlanSearchInput, ResearchSearchInput, ResearchSearchSourcesInput, ResearchSelectSourcesInput } from "./schemas.js";

export const RESEARCH_PACK_ID = "open-lagrange.research";

export async function runResearchSearch(context: PackExecutionContext, input: ResearchSearchInput) {
  return searchSources(primitiveContext(context, "research.search"), input, {
    provider_configs: parseSearchProviderConfigs(context.runtime_config.search_providers),
  });
}

export async function runResearchPlanSearch(_context: PackExecutionContext, input: ResearchPlanSearchInput) {
  return {
    search_plan: SearchPlan.parse({
      search_plan_id: `search_plan_${stableHash(input).slice(0, 16)}`,
      topic: input.topic,
      objective: input.objective ?? `Find source candidates for ${input.topic}.`,
      queries: [input.query ?? input.topic],
      limits: {
        max_queries: input.max_queries,
        max_results_per_query: input.max_results,
        max_sources_to_fetch: input.max_results,
        max_total_fetch_bytes: RESEARCH_LIMITS.max_fetch_bytes,
        max_provider_calls: input.max_queries,
        max_search_duration_ms: 8_000,
      },
      provider_preferences: input.provider_id ? [{ provider_id: input.provider_id }] : [],
      domains_allowlist: [],
      domains_denylist: [],
      source_type_preferences: [],
      stop_conditions: { min_results: Math.min(3, input.max_results), stop_after_first_provider_with_results: true },
    }),
  };
}

export async function runResearchSearchSources(context: PackExecutionContext, input: ResearchSearchSourcesInput) {
  const primitives = primitiveContext(context, "research.search_sources");
  const registry = new SearchProviderRegistry({
    context: primitives,
    configs: parseSearchProviderConfigs(context.runtime_config.search_providers),
    allow_fixture: input.mode === "fixture",
  });
  const coordinator = new SearchCoordinator({ context: primitives, registry, allow_fixture: input.mode === "fixture" });
  return { result_set: await coordinator.execute(input.search_plan, { urls: input.urls }) };
}

export async function runResearchSelectSources(_context: PackExecutionContext, input: ResearchSelectSourcesInput) {
  return {
    selected_sources: input.result_set.selected_candidates.slice(0, input.max_sources),
    warnings: input.result_set.selected_candidates.length === 0 ? ["no_source_candidates_selected"] : [],
  };
}

export async function runResearchFetchSource(context: PackExecutionContext, input: ResearchFetchSourceInput) {
  return fetchSource(primitiveContext(context, "research.fetch_source"), input);
}

export async function runResearchExtractContent(context: PackExecutionContext, input: ExtractContentInput) {
  const primitives = primitiveContext(context, "research.extract_content");
  const sourceArtifact = input.source_artifact_id ? await artifacts.readMetadata(primitives, input.source_artifact_id) : undefined;
  const resolvedInput = input.source_artifact_id && !input.html && !input.markdown && !input.text
    ? { ...input, ...sourceInputFromArtifact(sourceArtifact) }
    : input;
  const sourceMode = sourceModeFromArtifact(sourceArtifact);
  const extracted = extractReadableContent(resolvedInput);
  await artifacts.write(primitives, {
    artifact_id: extracted.artifact_id,
    kind: "source_text",
    title: extracted.title ?? extracted.url,
    summary: `Extracted ${extracted.word_count} word(s) from ${extracted.domain}.`,
    content: extracted,
    input_artifact_refs: input.source_artifact_id ? [input.source_artifact_id] : [],
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: {
      ...(sourceMode ? { source_mode: sourceMode } : {}),
    },
  });
  return extracted;
}

function sourceInputFromArtifact(artifact: unknown): Partial<ExtractContentInput> {
  const record = artifact && typeof artifact === "object" ? artifact as Record<string, unknown> : {};
  const content = record.content;
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as Record<string, unknown> : {};
  const url = stringValue(metadata.final_url) ?? stringValue(metadata.url) ?? stringValue(record.path_or_uri);
  if (typeof content === "string") {
    const contentType = stringValue(record.content_type) ?? "";
    return {
      ...(contentType.includes("html") ? { html: content } : contentType.includes("markdown") ? { markdown: content } : { text: content }),
      ...(url && url.startsWith("http") ? { url } : {}),
    };
  }
  if (content && typeof content === "object") {
    const value = content as Record<string, unknown>;
    const nestedContent = stringValue(value.content);
    if (nestedContent) return { markdown: nestedContent, ...(stringValue((value.source as Record<string, unknown> | undefined)?.url) ? { url: String((value.source as Record<string, unknown>).url) } : {}) };
    if (stringValue(value.extracted_text)) return { text: stringValue(value.extracted_text), ...(stringValue(value.url) ? { url: stringValue(value.url) } : {}) };
  }
  return {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sourceModeFromArtifact(artifact: unknown): "fixture" | "live" | undefined {
  const record = artifact && typeof artifact === "object" ? artifact as Record<string, unknown> : {};
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as Record<string, unknown> : {};
  const value = stringValue(record.source_mode) ?? stringValue(metadata.source_mode) ?? stringValue(metadata.mode);
  return value === "fixture" || value === "live" ? value : undefined;
}

export async function runResearchCreateSourceSet(context: PackExecutionContext, input: CreateSourceSetInput) {
  return createSourceSet(primitiveContext(context, "research.create_source_set"), input);
}

export async function runResearchCreateBrief(context: PackExecutionContext, input: CreateBriefInput) {
  return createResearchBrief(primitiveContext(context, "research.create_brief"), input);
}

export async function runResearchExportMarkdown(context: PackExecutionContext, input: ExportMarkdownInput) {
  return exportResearchMarkdown(primitiveContext(context, "research.export_markdown"), input);
}

function primitiveContext(context: PackExecutionContext, capabilityId: string) {
  const artifactStore = runtimeArtifactStore(context);
  return createPrimitiveContext(context, {
    pack_id: RESEARCH_PACK_ID,
    capability_id: capabilityId,
    ...(artifactStore ? { artifact_store: artifactStore } : {}),
    policy_context: {
      allowed_http_methods: ["GET"],
      ...(Array.isArray(context.runtime_config.allowed_hosts) ? { allowed_hosts: context.runtime_config.allowed_hosts as string[] } : {}),
    },
    limits: {
      default_timeout_ms: 8_000,
      default_max_bytes: RESEARCH_LIMITS.max_fetch_bytes,
      default_redirect_limit: 3,
      allowed_http_methods: ["GET"],
      allow_private_network: false,
    },
    ...(typeof context.runtime_config.fetch_impl === "function" ? { fetch_impl: context.runtime_config.fetch_impl as typeof fetch } : {}),
  });
}

function runtimeArtifactStore(context: PackExecutionContext) {
  const store = context.runtime_config.artifact_store;
  if (!store || typeof store !== "object") return undefined;
  const candidate = store as {
    readonly readMetadata?: (artifact_id: string) => Promise<unknown | undefined>;
    readonly link?: (from_artifact_id: string, to_artifact_id: string, metadata?: Record<string, unknown>) => Promise<void>;
  };
  return {
    write: context.recordArtifact,
    ...(candidate.readMetadata ? { readMetadata: candidate.readMetadata } : {}),
    ...(candidate.link ? { link: candidate.link } : {}),
  };
}

export function researchRunId(input: unknown): string {
  return `research_${stableHash(input).slice(0, 16)}`;
}
