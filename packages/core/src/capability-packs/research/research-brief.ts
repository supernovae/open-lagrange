import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { artifacts } from "@open-lagrange/capability-sdk/primitives";
import { stableHash } from "../../util/hash.js";
import { citationLabel } from "./citations.js";
import { CreateBriefOutput, type CreateBriefInput, type ExportMarkdownInput, type ExportMarkdownOutput } from "./schemas.js";

export async function createResearchBrief(context: PrimitiveContext, input: CreateBriefInput): Promise<CreateBriefOutput> {
  const citations = input.sources.map((source) => source.citation);
  const warnings = citations.length === 0 ? ["brief_requires_citations"] : [];
  const briefId = `research_brief_${stableHash({ topic: input.topic, sources: input.sources.map((source) => source.source_id) }).slice(0, 16)}`;
  const markdown = renderBrief(input, citations.map((citation) => citationLabel(citation)));
  const artifactId = `${briefId}_artifact`;
  const output = CreateBriefOutput.parse({
    brief_id: briefId,
    topic: input.topic,
    markdown,
    citations,
    source_coverage: input.sources.map((source) => ({
      source_id: source.source_id,
      citation_id: source.citation.citation_id,
      used_for: ["facts", "synthesis"],
    })),
    artifact_id: artifactId,
    warnings,
  });
  await artifacts.write(context, {
    artifact_id: artifactId,
    kind: "research_brief",
    title: `Research brief: ${input.topic}`,
    summary: `Cited ${input.brief_style} brief with ${citations.length} source(s).`,
    content: markdown,
    content_type: "text/markdown",
    input_artifact_refs: input.sources.map((source) => source.artifact_id),
    validation_status: warnings.length === 0 ? "pass" : "fail",
    redaction_status: "redacted",
    metadata: { brief_id: briefId, citations, source_coverage: output.source_coverage },
  });
  return output;
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

function renderBrief(input: CreateBriefInput, labels: readonly string[]): string {
  const sourceLines = input.sources.map((source, index) => `- ${source.excerpt} ${labels[index] ?? ""}`);
  const recommendation = input.include_recommendations ? "\n## Recommendations\n- Treat fixture-backed conclusions as demo evidence until live sources are fetched and reviewed.\n" : "";
  return [
    `# ${input.topic}`,
    "",
    "## Source-backed facts",
    ...sourceLines,
    "",
    "## Synthesis",
    `The provided sources support a ${input.brief_style} briefing about ${input.topic}. This section only combines the supplied extracted source text.`,
    "",
    "## Uncertainty",
    input.sources.length < 3 ? "- Source coverage is narrow; add more diverse sources before relying on this brief." : "- Source coverage is moderate; review source quality before external use.",
    recommendation.trimEnd(),
    "",
    "## Citations",
    ...input.sources.map((source) => `- ${source.citation.citation_id}: ${source.citation.title} (${source.citation.url})`),
  ].filter((line) => line.length > 0).join("\n");
}
