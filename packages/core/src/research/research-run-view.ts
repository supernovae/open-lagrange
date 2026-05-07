import { basename, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import type { ArtifactSummary } from "../artifacts/index.js";
import { exportArtifact, listArtifacts, showArtifact } from "../artifacts/index.js";
import type { StructuredError } from "../schemas/open-cot.js";
import type { NextAction } from "../runs/run-next-action.js";
import type { RunSnapshot } from "../runs/run-snapshot.js";
import type { SourceMode } from "../capability-packs/research/schemas.js";
import { buildResearchArtifactViews, isResearchArtifactKind, type ResearchArtifactView } from "./research-artifact-view.js";
import type { ResearchBriefView } from "./research-brief-view.js";
import type { CitationIndexEntryView, CitationIndexView, ResearchSourceView, SourceCoverage } from "./research-source-view.js";

export type ResearchPhase = "planning" | "searching" | "selecting_sources" | "fetching" | "extracting" | "synthesizing" | "exporting" | "completed";

export interface ResearchRunView {
  readonly run_id: string;
  readonly plan_id?: string;
  readonly topic: string;
  readonly provider_id?: string;
  readonly execution_mode: SourceMode;
  readonly status: RunSnapshot["status"];
  readonly current_phase?: ResearchPhase;
  readonly source_counts: {
    readonly found: number;
    readonly selected: number;
    readonly rejected: number;
    readonly fetched: number;
    readonly extracted: number;
    readonly failed: number;
  };
  readonly sources: readonly ResearchSourceView[];
  readonly brief?: ResearchBriefView;
  readonly citation_index?: CitationIndexView;
  readonly artifacts: readonly ResearchArtifactView[];
  readonly warnings: readonly string[];
  readonly errors: readonly StructuredError[];
  readonly next_actions: readonly NextAction[];
}

export function buildResearchRunView(input: {
  readonly snapshot: RunSnapshot;
  readonly artifact_index_path?: string;
}): ResearchRunView {
  const indexed = listArtifacts(input.artifact_index_path);
  const snapshotIds = new Set(input.snapshot.artifacts.map((artifact) => artifact.artifact_id));
  const related = indexed.filter((artifact) =>
    snapshotIds.has(artifact.artifact_id)
    || artifact.related_run_id === input.snapshot.run_id
    || artifact.related_plan_id === input.snapshot.plan_id
    || artifact.produced_by_plan_id === input.snapshot.plan_id
  );
  const snapshotArtifacts = input.snapshot.artifacts.map((artifact) => fullSummaryFor(artifact, indexed));
  const artifacts = dedupeArtifacts([...snapshotArtifacts, ...related]).filter((artifact) => isResearchArtifactKind(artifact.kind));
  const artifactViews = buildResearchArtifactViews({ artifacts, ...(input.artifact_index_path ? { artifact_index_path: input.artifact_index_path } : {}) });
  const sourceMap = new Map<string, MutableSource>();
  const warnings: string[] = [];

  for (const artifact of artifactViews) {
    ingestArtifact(sourceMap, warnings, artifact);
  }

  const sources = [...sourceMap.values()]
    .map((source) => ({
      source_id: source.source_id,
      title: source.title || source.url || source.source_id,
      url: source.url || "",
      domain: source.domain || domainFromUrl(source.url),
      ...(source.source_type ? { source_type: source.source_type } : {}),
      selected: source.selected,
      rejected: source.rejected,
      ...(source.rejection_reason ? { rejection_reason: source.rejection_reason } : {}),
      ...(source.selection_reason ? { selection_reason: source.selection_reason } : {}),
      fetched: source.fetched,
      extracted: source.extracted,
      ...(source.citation_id ? { citation_id: source.citation_id } : {}),
      ...(source.search_rank !== undefined ? { search_rank: source.search_rank } : {}),
      ...(source.provider_id ? { provider_id: source.provider_id } : {}),
      ...(source.published_at ? { published_at: source.published_at } : {}),
      ...(source.retrieved_at ? { retrieved_at: source.retrieved_at } : {}),
      artifact_refs: [...source.artifact_refs],
      warnings: [...source.warnings],
      ...(source.execution_mode ? { execution_mode: source.execution_mode } : {}),
    }))
    .sort((left, right) => (left.search_rank ?? 9_999) - (right.search_rank ?? 9_999) || left.source_id.localeCompare(right.source_id));

  const brief = briefView(artifactViews, sources);
  const citationIndex = citationIndexView(artifactViews, brief);
  const executionMode = executionModeFor(artifacts);
  const currentPhase = phaseFor(input.snapshot);
  const selectedCount = sources.filter((source) => source.selected).length;
  const rejectedCount = sources.filter((source) => source.rejected).length;
  const fetchedCount = sources.filter((source) => source.fetched).length;
  const extractedCount = sources.filter((source) => source.extracted).length;
  const failedCount = sources.filter((source) => source.warnings.some((warning) => /failed/i.test(warning))).length;

  const providerId = providerFromArtifacts(artifactViews);
  return {
    run_id: input.snapshot.run_id,
    plan_id: input.snapshot.plan_id,
    topic: brief?.topic ?? topicFromSnapshot(input.snapshot),
    ...(providerId ? { provider_id: providerId } : {}),
    execution_mode: executionMode,
    status: input.snapshot.status,
    ...(currentPhase ? { current_phase: currentPhase } : {}),
    source_counts: {
      found: sources.length,
      selected: selectedCount,
      rejected: rejectedCount,
      fetched: fetchedCount,
      extracted: extractedCount,
      failed: failedCount,
    },
    sources,
    ...(brief ? { brief } : {}),
    ...(citationIndex ? { citation_index: citationIndex } : {}),
    artifacts: artifactViews,
    warnings: [...new Set([...warnings, ...artifacts.map((artifact) => artifact.mode_warning).filter(isString)])],
    errors: input.snapshot.errors,
    next_actions: input.snapshot.next_actions,
  };
}

export function explainResearchRun(view: ResearchRunView): string {
  return [
    `Research run: ${view.run_id}`,
    `Topic: ${view.topic}`,
    `Status: ${view.status}`,
    `Mode: ${view.execution_mode}`,
    ...(view.provider_id ? [`Provider: ${view.provider_id}`] : []),
    ...(view.current_phase ? [`Current phase: ${view.current_phase}`] : []),
    `Sources: ${view.source_counts.found} found, ${view.source_counts.selected} selected, ${view.source_counts.rejected} rejected, ${view.source_counts.failed} failed`,
    ...(view.brief ? [`Brief: ${view.brief.artifact_id} (${view.brief.citation_count} citation(s))`] : ["Brief: not available yet"]),
    ...(view.warnings.length > 0 ? ["", "Warnings:", ...view.warnings.map((warning) => `- ${warning}`)] : []),
    ...(view.next_actions.length > 0 ? ["", "Next actions:", ...view.next_actions.map((action) => `- ${action.label}${action.command ? `: ${action.command}` : ""}`)] : []),
  ].join("\n");
}

export function exportResearchViewArtifact(input: {
  readonly artifact_id: string;
  readonly output_path: string;
  readonly artifact_index_path?: string;
}): { readonly artifact_id: string; readonly output_path: string } {
  const artifact = showArtifact(input.artifact_id, input.artifact_index_path);
  if (!artifact) throw new Error(`Artifact not found: ${input.artifact_id}`);
  if (artifact.summary.kind === "research_brief" || artifact.summary.kind === "markdown_export") {
    mkdirSync(dirname(input.output_path), { recursive: true });
    writeFileSync(input.output_path, typeof artifact.content === "string" ? artifact.content : stringField(objectValue(artifact.content), "markdown") ?? "", "utf8");
    return { artifact_id: input.artifact_id, output_path: input.output_path };
  }
  exportArtifact({ artifact_id: input.artifact_id, output_path: input.output_path, ...(input.artifact_index_path ? { index_path: input.artifact_index_path } : {}) });
  return { artifact_id: input.artifact_id, output_path: input.output_path };
}

interface MutableSource {
  source_id: string;
  title: string;
  url: string;
  domain: string;
  source_type?: string;
  selected: boolean;
  rejected: boolean;
  rejection_reason?: string;
  selection_reason?: string;
  fetched: boolean;
  extracted: boolean;
  citation_id?: string;
  search_rank?: number;
  provider_id?: string;
  published_at?: string;
  retrieved_at?: string;
  artifact_refs: Set<string>;
  warnings: Set<string>;
  execution_mode?: SourceMode;
}

function ingestArtifact(sources: Map<string, MutableSource>, warnings: string[], artifact: ResearchArtifactView): void {
  const content = objectValue(artifact.content);
  const sourceMode = sourceModeValue(stringField(content, "mode") ?? stringField(content, "execution_mode") ?? stringField(content, "source_mode"));
  if (artifact.kind === "source_search_results") {
    for (const item of arrayField(content, "results", "candidates", "selected_candidates")) {
      const record = objectValue(item);
      const source = ensureSource(sources, stringField(record, "source_id") ?? stableSourceId(record));
      mergeSource(source, record, artifact.artifact_id, { ...(sourceMode ? { execution_mode: sourceMode } : {}), searched: true });
    }
    warnings.push(...stringArray(content.warnings));
  }
  if (artifact.kind === "source_set") {
    for (const item of arrayField(content, "selected_sources")) {
      const record = objectValue(item);
      const source = ensureSource(sources, stringField(record, "source_id") ?? stableSourceId(record));
      mergeSource(source, record, artifact.artifact_id, { selected: true });
    }
    for (const item of arrayField(content, "rejected_sources")) {
      const record = objectValue(item);
      const source = ensureSource(sources, stringField(record, "source_id") ?? stableSourceId(record));
      source.rejected = true;
      const reason = stringField(record, "reason");
      if (reason) source.rejection_reason = reason;
      source.artifact_refs.add(artifact.artifact_id);
    }
    for (const item of arrayField(content, "selection_reasons")) {
      const record = objectValue(item);
      const source = ensureSource(sources, stringField(record, "source_id") ?? stableSourceId(record));
      const reason = stringField(record, "reason");
      if (reason) source.selection_reason = reason;
      if (record.selected === false && reason) source.rejection_reason = reason;
    }
    warnings.push(...stringArray(content.warnings));
  }
  if (artifact.kind === "source_snapshot" || artifact.kind === "source_text") {
    const source = ensureSource(sources, stringField(content, "source_id") ?? stableSourceId(content));
    mergeSource(source, content, artifact.artifact_id, { fetched: artifact.kind === "source_snapshot", extracted: artifact.kind === "source_text", ...(sourceMode ? { execution_mode: sourceMode } : {}) });
    for (const warning of stringArray(content.warnings)) source.warnings.add(warning);
  }
  if (artifact.kind === "research_brief" || artifact.kind === "markdown_export") {
    const metadata = objectValue(objectValue(artifact.content).metadata);
    warnings.push(...stringArray(content.warnings), ...stringArray(metadata.warnings));
  }
}

function briefView(artifacts: readonly ResearchArtifactView[], sources: readonly ResearchSourceView[]): ResearchBriefView | undefined {
  const briefArtifact = [...artifacts].reverse().find((artifact) => artifact.kind === "research_brief");
  if (!briefArtifact) return undefined;
  const content = objectValue(briefArtifact.content);
  const metadata = objectValue(content.metadata);
  const markdown = typeof briefArtifact.content === "string" ? briefArtifact.content : stringField(content, "markdown") ?? stringField(content, "content") ?? "";
  const sourceCoverage = sourceCoverageFrom(content, metadata);
  const title = markdownTitle(markdown) ?? stringField(metadata, "synthesis_title") ?? briefArtifact.title;
  const topic = stringField(content, "topic") ?? title;
  const exportRefs = artifacts.filter((artifact) => artifact.kind === "markdown_export").map((artifact) => artifact.artifact_id);
  return {
    brief_id: stringField(content, "brief_id") ?? stringField(metadata, "brief_id") ?? briefArtifact.artifact_id,
    title,
    topic,
    markdown,
    artifact_id: briefArtifact.artifact_id,
    citation_count: citationEntries(content, metadata).length || sources.filter((source) => source.citation_id).length,
    source_coverage: sourceCoverage,
    generated_at: new Date().toISOString(),
    export_artifact_refs: exportRefs,
  };
}

function citationIndexView(artifacts: readonly ResearchArtifactView[], brief: ResearchBriefView | undefined): CitationIndexView | undefined {
  const citationArtifact = [...artifacts].reverse().find((artifact) => artifact.kind === "citation_index");
  const content = objectValue(citationArtifact?.content);
  const metadata = objectValue(content.metadata);
  const citations = citationEntries(content, metadata);
  if (citations.length > 0) return { citations };
  if (!brief) return undefined;
  return { citations: brief.source_coverage.map((coverage) => ({ citation_id: coverage.citation_id, source_id: coverage.source_id, title: coverage.source_id, url: "", domain: "" })) };
}

function citationEntries(content: Record<string, unknown>, metadata: Record<string, unknown>): CitationIndexEntryView[] {
  return [...arrayField(content, "citations"), ...arrayField(metadata, "citations")].map((item) => {
    const record = objectValue(item);
    const retrievedAt = stringField(record, "retrieved_at");
    const publishedAt = stringField(record, "published_at");
    return {
      citation_id: stringField(record, "citation_id") ?? stringField(record, "source_id") ?? "citation",
      source_id: stringField(record, "source_id") ?? stringField(record, "citation_id") ?? "source",
      title: stringField(record, "title") ?? stringField(record, "url") ?? "Source",
      url: stringField(record, "url") ?? "",
      domain: stringField(record, "domain") ?? domainFromUrl(stringField(record, "url")),
      ...(retrievedAt ? { retrieved_at: retrievedAt } : {}),
      ...(publishedAt ? { published_at: publishedAt } : {}),
    };
  });
}

function sourceCoverageFrom(content: Record<string, unknown>, metadata: Record<string, unknown>): SourceCoverage[] {
  return [...arrayField(content, "source_coverage"), ...arrayField(metadata, "source_coverage")].map((item) => {
    const record = objectValue(item);
    return {
      source_id: stringField(record, "source_id") ?? "source",
      citation_id: stringField(record, "citation_id") ?? stringField(record, "source_id") ?? "citation",
      used_for: stringArray(record.used_for),
    };
  });
}

function ensureSource(sources: Map<string, MutableSource>, sourceId: string): MutableSource {
  const existing = sources.get(sourceId);
  if (existing) return existing;
  const source: MutableSource = { source_id: sourceId, title: "", url: "", domain: "", selected: false, rejected: false, fetched: false, extracted: false, artifact_refs: new Set(), warnings: new Set() };
  sources.set(sourceId, source);
  return source;
}

function mergeSource(source: MutableSource, record: Record<string, unknown>, artifactId: string, flags: { readonly selected?: boolean; readonly fetched?: boolean; readonly extracted?: boolean; readonly searched?: boolean; readonly execution_mode?: SourceMode }): void {
  const title = stringField(record, "title");
  const url = stringField(record, "url") ?? stringField(record, "final_url");
  const domain = stringField(record, "domain") ?? domainFromUrl(url ?? source.url);
  const sourceType = stringField(record, "source_type");
  const citationId = stringField(record, "citation_id") ?? stringField(objectValue(record.citation), "citation_id");
  const searchRank = numberField(record, "rank") ?? numberField(record, "search_rank");
  const providerId = stringField(record, "provider_id");
  const publishedAt = stringField(record, "published_at");
  const retrievedAt = stringField(record, "retrieved_at") ?? stringField(objectValue(record.citation), "retrieved_at");
  if (title) source.title = title;
  if (url) source.url = url;
  if (domain) source.domain = domain;
  if (sourceType) source.source_type = sourceType;
  if (citationId) source.citation_id = citationId;
  if (searchRank !== undefined) source.search_rank = searchRank;
  if (providerId) source.provider_id = providerId;
  if (publishedAt) source.published_at = publishedAt;
  if (retrievedAt) source.retrieved_at = retrievedAt;
  source.selected = flags.selected ?? source.selected;
  source.fetched = flags.fetched ?? source.fetched;
  source.extracted = flags.extracted ?? source.extracted;
  if (flags.execution_mode) source.execution_mode = flags.execution_mode;
  source.artifact_refs.add(artifactId);
}

function fullSummaryFor(artifact: RunSnapshot["artifacts"][number], indexed: readonly ArtifactSummary[]): ArtifactSummary {
  const full = indexed.find((candidate) => candidate.artifact_id === artifact.artifact_id);
  return full ?? {
    ...artifact,
    redacted: true,
    exportable: artifact.exportable,
    execution_mode: "live",
  };
}

function dedupeArtifacts(artifacts: readonly ArtifactSummary[]): ArtifactSummary[] {
  return [...new Map(artifacts.map((artifact) => [artifact.artifact_id, artifact])).values()];
}

function phaseFor(snapshot: RunSnapshot): ResearchPhase | undefined {
  if (snapshot.status === "completed") return "completed";
  const active = snapshot.nodes.find((node) => node.node_id === snapshot.active_node_id) ?? snapshot.nodes.find((node) => node.status === "running" || node.status === "yielded");
  const text = `${active?.node_id ?? ""} ${active?.title ?? ""} ${active?.capability_refs.join(" ") ?? ""}`.toLowerCase();
  if (/plan|frame/.test(text)) return "planning";
  if (/search/.test(text)) return "searching";
  if (/select|source_set/.test(text)) return "selecting_sources";
  if (/fetch/.test(text)) return "fetching";
  if (/extract/.test(text)) return "extracting";
  if (/brief|synth/.test(text)) return "synthesizing";
  if (/export/.test(text)) return "exporting";
  return undefined;
}

function executionModeFor(artifacts: readonly ArtifactSummary[]): SourceMode {
  return artifacts.find((artifact) => artifact.execution_mode)?.execution_mode ?? "live";
}

function topicFromSnapshot(snapshot: RunSnapshot): string {
  return snapshot.plan_title ?? snapshot.plan_id;
}

function providerFromArtifacts(artifacts: readonly ResearchArtifactView[]): string | undefined {
  for (const artifact of artifacts) {
    const content = objectValue(artifact.content);
    const provider = stringField(content, "provider_id") ?? stringField(objectValue(content.provider), "id");
    if (provider) return provider;
  }
  return undefined;
}

function stableSourceId(record: Record<string, unknown>): string {
  return stringField(record, "url") ?? stringField(record, "title") ?? "source";
}

function markdownTitle(markdown: string): string | undefined {
  return markdown.split(/\r?\n/u).find((line) => line.startsWith("# "))?.replace(/^#\s+/u, "").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function arrayField(record: Record<string, unknown>, ...keys: readonly string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function sourceModeValue(value: string | undefined): SourceMode | undefined {
  if (value === "live" || value === "dry_run" || value === "fixture" || value === "mock" || value === "test") return value;
  return undefined;
}

function domainFromUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).hostname;
  } catch {
    return basename(dirname(value));
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
