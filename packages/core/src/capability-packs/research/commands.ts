import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createTestPackContext } from "@open-lagrange/capability-sdk";
import { createArtifactSummary, listArtifacts, registerArtifacts, showArtifact, type ArtifactSummary } from "../../artifacts/index.js";
import { stableHash } from "../../util/hash.js";
import { readFixtureSource } from "./fixtures.js";
import { runResearchCreateBrief, runResearchCreateSourceSet, runResearchExportMarkdown, runResearchExtractContent, runResearchFetchSource, runResearchSearch } from "./executor.js";
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
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  const run = commandRun(input.query, input.output_dir);
  const store = artifactStore(run.output_dir);
  const result = await runResearchSearch(createTestPackContext({ recordArtifact: store.recordArtifact }), {
    query: input.query,
    mode: input.mode ?? "fixture",
    max_results: 5,
    freshness: "any",
  });
  const artifacts = store.flush(input.index_path);
  return { run_id: run.run_id, output_dir: run.output_dir, result, artifacts, warnings: result.warnings };
}

export async function runResearchFetchCommand(input: {
  readonly url: string;
  readonly mode: SourceMode;
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  const run = commandRun(input.url, input.output_dir);
  const store = artifactStore(run.output_dir);
  const result = await runResearchFetchSource(createTestPackContext({ recordArtifact: store.recordArtifact }), {
    url: input.url,
    mode: input.mode,
    max_bytes: 500_000,
    timeout_ms: 8_000,
    accepted_content_types: ["text/html", "text/plain", "text/markdown", "application/xhtml+xml"],
  });
  const artifacts = store.flush(input.index_path);
  return { run_id: run.run_id, output_dir: run.output_dir, result, artifacts, warnings: result.warnings };
}

export async function runResearchBriefCommand(input: {
  readonly topic: string;
  readonly mode?: SourceMode;
  readonly output_dir?: string;
  readonly index_path?: string;
}): Promise<ResearchCommandResult> {
  const run = commandRun(input.topic, input.output_dir);
  const store = artifactStore(run.output_dir);
  const context = createTestPackContext({ recordArtifact: store.recordArtifact });
  const search = await runResearchSearch(context, { query: input.topic, mode: input.mode ?? "fixture", max_results: 5, freshness: "any" });
  const extracted: ExtractedSource[] = [];
  for (const result of search.results.slice(0, 5)) {
    const fixture = readFixtureSource(result.source_id);
    if (!fixture) continue;
    extracted.push(await runResearchExtractContent(context, { markdown: fixture.content, url: fixture.source.url, max_chars: 20_000 }));
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
  return { run_id: run.run_id, output_dir: run.output_dir, result: { search, source_set: sourceSet, brief }, artifacts, warnings: brief.warnings };
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
