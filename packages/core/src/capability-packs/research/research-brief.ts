import type { PackExecutionContext } from "@open-lagrange/capability-sdk";
import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { artifacts } from "@open-lagrange/capability-sdk/primitives";
import { z } from "zod";
import type { ModelRef, ModelRouteConfig } from "../../evals/model-route-config.js";
import { executeModelRoleCall, ModelRoleCallError, type ModelRoleTraceContext } from "../../models/model-route-executor.js";
import { stableHash } from "../../util/hash.js";
import { citationLabel } from "./citations.js";
import { CreateBriefOutput, type Citation, type CreateBriefInput, type CreateBriefOutput as CreateBriefOutputType, type ExportMarkdownInput, type ExportMarkdownOutput, type SourceCoverage } from "./schemas.js";

const ModelResearchBrief = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  key_findings: z.array(z.object({
    finding: z.string().min(1),
    source_ids: z.array(z.string().min(1)).min(1),
    confidence: z.enum(["low", "medium", "high"]).default("medium"),
  }).strict()).min(1),
  viewpoints: z.array(z.object({
    label: z.string().min(1),
    summary: z.string().min(1),
    source_ids: z.array(z.string().min(1)).min(1),
  }).strict()).default([]),
  uncertainties: z.array(z.string().min(1)).default([]),
  recommendations: z.array(z.string().min(1)).default([]),
}).strict().describe("ResearchBriefSynthesis");

type ModelResearchBrief = z.infer<typeof ModelResearchBrief>;

type BriefModelGenerator = (input: {
  readonly prompt: string;
  readonly system: string;
  readonly schema: typeof ModelResearchBrief;
  readonly sources: CreateBriefInput["sources"];
}) => Promise<ModelResearchBrief> | ModelResearchBrief;

export async function createResearchBrief(context: PrimitiveContext, input: CreateBriefInput): Promise<CreateBriefOutput> {
  return createResearchBriefFromSynthesis(context, input, fixtureSynthesis(input), { warnings: ["fixture_brief_generator_used"] });
}

export async function createResearchBriefWithModel(packContext: PackExecutionContext, context: PrimitiveContext, input: CreateBriefInput): Promise<CreateBriefOutput> {
  const citations = input.sources.map((source) => source.citation);
  const warnings = citations.length === 0 ? ["brief_requires_citations"] : [];
  const generator = briefModelGenerator(packContext.runtime_config.model_brief_generator);
  const { system, prompt } = modelPrompt(input, citations);
  let synthesis: ModelResearchBrief;
  let telemetryArtifactId: string | undefined;
  if (generator) {
    synthesis = await generator({ prompt, system, schema: ModelResearchBrief, sources: input.sources });
  } else {
    const route = modelRouteFromRuntime(packContext.runtime_config.model_route);
    const modelRef = modelRefFromRuntime(packContext.runtime_config.model_ref) ?? route?.roles.implementer;
    if (!modelRef) {
      throw new ModelRoleCallError("MODEL_PROVIDER_UNAVAILABLE", "Research brief generation requires a configured model provider.");
    }
    const result = await executeModelRoleCall({
      role: "implementer",
      model_ref: modelRef,
      schema: ModelResearchBrief,
      system,
      prompt,
      trace_context: modelTraceContext(packContext, context, input, route?.route_id),
      persist_telemetry: true,
    });
    synthesis = result.object;
    telemetryArtifactId = result.telemetry_artifact_id;
    if (telemetryArtifactId) {
      await recordModelCallReference(context, input, telemetryArtifactId, modelRef);
    }
  }
  return createResearchBriefFromSynthesis(context, input, synthesis, { warnings });
}

function createResearchBriefFromSynthesis(
  context: PrimitiveContext,
  input: CreateBriefInput,
  synthesis: ModelResearchBrief,
  options: { readonly warnings?: readonly string[] } = {},
): Promise<CreateBriefOutputType> {
  const citations = input.sources.map((source) => source.citation);
  const labels = new Map(citations.map((citation) => [citation.source_id, citationLabel(citation)]));
  const coverage = sourceCoverage(input, synthesis);
  const warnings = [...(options.warnings ?? []), ...(coverage.length === 0 ? ["model_brief_missing_valid_source_refs"] : [])];
  const briefId = `research_brief_${stableHash({ topic: input.topic, sources: input.sources.map((source) => source.source_id) }).slice(0, 16)}`;
  const markdown = renderModelBrief(input, synthesis, labels);
  const artifactId = `${briefId}_artifact`;
  const output = CreateBriefOutput.parse({
    brief_id: briefId,
    topic: input.topic,
    markdown,
    citations,
    source_coverage: coverage.length > 0 ? coverage : input.sources.map((source) => ({ source_id: source.source_id, citation_id: source.citation.citation_id, used_for: ["context"] })),
    artifact_id: artifactId,
    warnings,
  });
  return artifacts.write(context, {
    artifact_id: artifactId,
    kind: "research_brief",
    title: `Research brief: ${input.topic}`,
    summary: `Cited ${input.brief_style} brief with ${citations.length} source(s).`,
    content: markdown,
    content_type: "text/markdown",
    input_artifact_refs: input.sources.map((source) => source.artifact_id),
    validation_status: warnings.length === 0 ? "pass" : "fail",
    redaction_status: "redacted",
    metadata: { brief_id: briefId, citations, source_coverage: output.source_coverage, synthesis_title: synthesis.title },
  }).then(() => output);
}

export async function exportResearchMarkdown(context: PrimitiveContext, input: ExportMarkdownInput): Promise<ExportMarkdownOutput> {
  const artifactId = `research_markdown_${stableHash({ title: input.title, markdown: input.markdown }).slice(0, 16)}`;
  await artifacts.write(context, {
    artifact_id: artifactId,
    kind: "research_brief",
    title: input.title,
    summary: `Exported markdown for ${input.title}.`,
    content: input.markdown,
    content_type: "text/markdown",
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: { related_source_ids: input.related_source_ids },
  });
  return { artifact_id: artifactId, title: input.title, path_or_uri: `artifact://${artifactId}`, related_source_ids: input.related_source_ids };
}

function renderModelBrief(input: CreateBriefInput, synthesis: ModelResearchBrief, labels: ReadonlyMap<string, string>): string {
  const findingLines = synthesis.key_findings.map((finding) => `- ${finding.finding} ${labelsForSourceIds(labels, finding.source_ids)} Confidence: ${finding.confidence}.`);
  const viewpointLines = synthesis.viewpoints.map((viewpoint) => `- **${viewpoint.label}:** ${viewpoint.summary} ${labelsForSourceIds(labels, viewpoint.source_ids)}`);
  const uncertaintyLines = synthesis.uncertainties.length > 0 ? synthesis.uncertainties.map((item) => `- ${item}`) : ["- The brief only uses the fetched source set; review source quality before external use."];
  const recommendationLines = input.include_recommendations && synthesis.recommendations.length > 0 ? synthesis.recommendations.map((item) => `- ${item}`) : [];
  return [
    `# ${synthesis.title || input.topic}`,
    "",
    "## Overview",
    synthesis.overview,
    "",
    "## Key Findings",
    ...findingLines,
    "",
    ...(viewpointLines.length > 0 ? ["## Viewpoints", ...viewpointLines, ""] : []),
    "## Uncertainty",
    ...uncertaintyLines,
    "",
    ...(recommendationLines.length > 0 ? ["## Recommendations", ...recommendationLines, ""] : []),
    "## Sources",
    ...input.sources.map((source) => `- ${source.citation.citation_id}: ${source.citation.title} (${source.citation.url})`),
  ].filter((line) => line.length > 0).join("\n");
}

function modelPrompt(input: CreateBriefInput, citations: readonly Citation[]): { readonly system: string; readonly prompt: string } {
  const sourceBlocks = input.sources.map((source, index) => [
    `SOURCE ${index + 1}`,
    `source_id: ${source.source_id}`,
    `citation_id: ${source.citation.citation_id}`,
    `title: ${source.title ?? source.citation.title}`,
    `url: ${source.url}`,
    `domain: ${source.domain}`,
    `excerpt: ${source.excerpt}`,
    "",
    source.extracted_text.slice(0, 4_000),
  ].join("\n"));
  return {
    system: [
      "You synthesize research briefs from supplied source text only.",
      "Use multiple sources when available, preserve competing viewpoints, and cite every substantive claim with source_ids from the provided sources.",
      "Do not invent sources, URLs, publication dates, or claims that are not supported by the supplied extracted text.",
      "Return structured synthesis, not markdown.",
    ].join(" "),
    prompt: [
      `Topic: ${input.topic}`,
      `Brief style: ${input.brief_style}`,
      `Maximum target words: ${input.max_words}`,
      `Include recommendations: ${input.include_recommendations ? "yes" : "no"}`,
      "",
      "Available citations:",
      ...citations.map((citation) => `- ${citation.source_id}: ${citation.title} (${citation.url})`),
      "",
      "Extracted sources:",
      ...sourceBlocks,
    ].join("\n"),
  };
}

function sourceCoverage(input: CreateBriefInput, synthesis: ModelResearchBrief): SourceCoverage[] {
  const citations = new Map(input.sources.map((source) => [source.source_id, source.citation]));
  const used = new Map<string, Set<string>>();
  for (const finding of synthesis.key_findings) addCoverage(used, citations, finding.source_ids, "finding");
  for (const viewpoint of synthesis.viewpoints) addCoverage(used, citations, viewpoint.source_ids, "viewpoint");
  return [...used.entries()].map(([sourceId, uses]) => ({
    source_id: sourceId,
    citation_id: citations.get(sourceId)?.citation_id ?? sourceId,
    used_for: [...uses],
  }));
}

function addCoverage(target: Map<string, Set<string>>, citations: ReadonlyMap<string, Citation>, sourceIds: readonly string[], use: string): void {
  for (const sourceId of sourceIds) {
    if (!citations.has(sourceId)) continue;
    const uses = target.get(sourceId) ?? new Set<string>();
    uses.add(use);
    target.set(sourceId, uses);
  }
}

function labelsForSourceIds(labels: ReadonlyMap<string, string>, sourceIds: readonly string[]): string {
  const output = sourceIds.map((sourceId) => labels.get(sourceId)).filter((label): label is string => Boolean(label));
  return output.length > 0 ? output.join(" ") : "";
}

function fixtureSynthesis(input: CreateBriefInput): ModelResearchBrief {
  return ModelResearchBrief.parse({
    title: input.topic,
    overview: `The supplied fixture sources provide a bounded research brief on ${input.topic}.`,
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
    uncertainties: input.sources.length < 3 ? ["Source coverage is narrow; add more live sources before relying on this brief."] : ["Source quality should be reviewed before external use."],
    recommendations: input.include_recommendations ? ["Review live source provenance before making operational decisions."] : [],
  });
}

function briefModelGenerator(value: unknown): BriefModelGenerator | undefined {
  return typeof value === "function" ? value as BriefModelGenerator : undefined;
}

function modelRouteFromRuntime(value: unknown): ModelRouteConfig | undefined {
  const record = value && typeof value === "object" ? value as ModelRouteConfig : undefined;
  return record?.roles?.implementer ? record : undefined;
}

function modelRefFromRuntime(value: unknown): ModelRef | undefined {
  const record = value && typeof value === "object" ? value as ModelRef : undefined;
  return typeof record?.provider === "string" && typeof record.model === "string" && typeof record.role_label === "string" ? record : undefined;
}

function modelTraceContext(packContext: PackExecutionContext, context: PrimitiveContext, input: CreateBriefInput, routeId: string | undefined): ModelRoleTraceContext {
  return {
    ...(routeId ? { route_id: routeId } : {}),
    ...(context.plan_id ? { plan_id: context.plan_id } : {}),
    ...(context.node_id ? { node_id: context.node_id } : {}),
    ...stringOption("artifact_dir", packContext.runtime_config.artifact_dir),
    ...stringOption("artifact_index_path", packContext.runtime_config.artifact_index_path),
    input_artifact_refs: input.sources.map((source) => source.artifact_id),
    output_schema_name: "ResearchBriefSynthesis",
    metadata: { topic: input.topic, source_count: input.sources.length },
  };
}

async function recordModelCallReference(context: PrimitiveContext, input: CreateBriefInput, telemetryArtifactId: string, modelRef: ModelRef): Promise<void> {
  await artifacts.write(context, {
    artifact_id: `model_call_ref_${stableHash({ telemetryArtifactId, topic: input.topic }).slice(0, 16)}`,
    kind: "raw_log",
    title: "Research brief model call",
    summary: `${modelRef.provider}/${modelRef.model} synthesized the research brief.`,
    content: { model_call_artifact_id: telemetryArtifactId, provider: modelRef.provider, model: modelRef.model, role: modelRef.role_label },
    content_type: "application/json",
    input_artifact_refs: input.sources.map((source) => source.artifact_id),
    output_artifact_refs: [telemetryArtifactId],
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: { model_call_artifact_id: telemetryArtifactId },
  });
}

function stringOption(key: "artifact_dir" | "artifact_index_path", value: unknown): Record<typeof key, string> | {} {
  return typeof value === "string" && value.length > 0 ? { [key]: value } as Record<typeof key, string> : {};
}
