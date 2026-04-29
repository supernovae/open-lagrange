import type { PackExecutionContext } from "@open-lagrange/capability-sdk";
import { artifacts, createPrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { stableHash } from "../../util/hash.js";
import { extractReadableContent } from "./extractor.js";
import { fetchSource } from "./fetcher.js";
import { searchSources } from "./search-provider.js";
import { createResearchBrief, exportResearchMarkdown } from "./research-brief.js";
import { createSourceSet } from "./source-set.js";
import type { CreateBriefInput, CreateSourceSetInput, ExportMarkdownInput, ExtractContentInput, ResearchFetchSourceInput, ResearchSearchInput } from "./schemas.js";

export const RESEARCH_PACK_ID = "open-lagrange.research";

export async function runResearchSearch(context: PackExecutionContext, input: ResearchSearchInput) {
  return searchSources(primitiveContext(context, "research.search"), input);
}

export async function runResearchFetchSource(context: PackExecutionContext, input: ResearchFetchSourceInput) {
  return fetchSource(primitiveContext(context, "research.fetch_source"), input);
}

export async function runResearchExtractContent(context: PackExecutionContext, input: ExtractContentInput) {
  const primitives = primitiveContext(context, "research.extract_content");
  const extracted = extractReadableContent(input);
  await artifacts.write(primitives, {
    artifact_id: extracted.artifact_id,
    kind: "source_text",
    title: extracted.title ?? extracted.url,
    summary: `Extracted ${extracted.word_count} word(s) from ${extracted.domain}.`,
    content: extracted,
    input_artifact_refs: input.source_artifact_id ? [input.source_artifact_id] : [],
    validation_status: "pass",
    redaction_status: "redacted",
  });
  return extracted;
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
  return createPrimitiveContext(context, {
    pack_id: RESEARCH_PACK_ID,
    capability_id: capabilityId,
    policy_context: {
      allowed_http_methods: ["GET"],
      ...(Array.isArray(context.runtime_config.allowed_hosts) ? { allowed_hosts: context.runtime_config.allowed_hosts as string[] } : {}),
    },
    limits: {
      default_timeout_ms: 8_000,
      default_max_bytes: 500_000,
      default_redirect_limit: 3,
      allowed_http_methods: ["GET"],
      allow_private_network: false,
    },
    ...(typeof context.runtime_config.fetch_impl === "function" ? { fetch_impl: context.runtime_config.fetch_impl as typeof fetch } : {}),
  });
}

export function researchRunId(input: unknown): string {
  return `research_${stableHash(input).slice(0, 16)}`;
}
