import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { artifacts } from "@open-lagrange/capability-sdk/primitives";
import { stableHash } from "../../util/hash.js";
import { CreateSourceSetOutput, type CreateSourceSetInput, type SourceRejection, type SourceSelectionReason, type SourceSummary } from "./schemas.js";

export async function createSourceSet(context: PrimitiveContext, input: CreateSourceSetInput): Promise<CreateSourceSetOutput> {
  const max = input.selection_policy?.max_sources ?? 5;
  const requireDiverse = input.selection_policy?.require_diverse_domains ?? true;
  const selected: SourceSummary[] = [];
  const rejected: SourceRejection[] = [];
  const selectionReasons: SourceSelectionReason[] = [];
  const domains = new Set<string>();
  for (const source of input.sources) {
    if (selected.length >= max) {
      rejected.push({ source_id: source.source_id, reason: "limit_exceeded" });
      selectionReasons.push({ source_id: source.source_id, selected: false, reason: "limit_exceeded", detail: `Maximum source count reached: ${max}.` });
      continue;
    }
    if (requireDiverse && domains.has(source.domain)) {
      rejected.push({ source_id: source.source_id, reason: "duplicate" });
      selectionReasons.push({ source_id: source.source_id, selected: false, reason: "duplicate", detail: `Domain already represented: ${source.domain}.` });
      continue;
    }
    domains.add(source.domain);
    selectionReasons.push({
      source_id: source.source_id,
      selected: true,
      reason: source.citation.published_at ? "recent" : requireDiverse ? "diverse_domain" : "high_rank",
      detail: requireDiverse ? `Selected to preserve domain diversity for ${source.domain}.` : "Selected within the ranked source limit.",
    });
    selected.push({
      source_id: source.source_id,
      title: source.title ?? source.url,
      url: source.url,
      domain: source.domain,
      citation_id: source.citation.citation_id,
    });
  }
  const warnings = selected.length < (input.selection_policy?.min_sources ?? 1) ? ["selected_sources_below_minimum"] : [];
  const sourceSetId = `source_set_${stableHash({ topic: input.topic, selected }).slice(0, 16)}`;
  const artifactId = `${sourceSetId}_artifact`;
  const output = CreateSourceSetOutput.parse({
    source_set_id: sourceSetId,
    topic: input.topic,
    selected_sources: selected,
    rejected_sources: rejected,
    selection_reasons: selectionReasons,
    artifact_id: artifactId,
    warnings,
  });
  await artifacts.write(context, {
    artifact_id: artifactId,
    kind: "source_set",
    title: `Source set for ${input.topic}`,
    summary: `${selected.length} selected source(s), ${rejected.length} rejected.`,
    content: output,
    input_artifact_refs: input.sources.map((source) => source.artifact_id),
    validation_status: warnings.length === 0 ? "pass" : "pending",
    redaction_status: "redacted",
  });
  return output;
}
