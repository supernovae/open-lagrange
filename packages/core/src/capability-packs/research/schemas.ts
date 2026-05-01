import { z } from "zod";
import { ExecutionMode } from "../../runtime/execution-mode.js";

export const SourceMode = ExecutionMode;
export const ResearchSearchProviderMode = z.enum(["live", "fixture"]);
export const SourceType = z.enum(["official", "documentation", "news", "paper", "blog", "forum", "repo", "unknown"]);
export const Confidence = z.enum(["low", "medium", "high"]);

export const Citation = z.object({
  citation_id: z.string().min(1),
  source_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  retrieved_at: z.string().datetime(),
  published_at: z.string().datetime().optional(),
  quote_refs: z.array(z.string()).optional(),
}).strict();

export const SourceSearchResult = z.object({
  source_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().optional(),
  source_type: SourceType.optional(),
  published_at: z.string().datetime().optional(),
  retrieved_at: z.string().datetime().optional(),
  domain: z.string().min(1),
  confidence: Confidence.optional(),
}).strict();

export const ResearchSearchInput = z.object({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(25).default(5),
  freshness: z.enum(["any", "recent", "last_30_days", "last_year"]).default("any"),
  preferred_source_types: z.array(SourceType.exclude(["unknown"])).optional(),
  domains_allowlist: z.array(z.string().min(1)).optional(),
  domains_denylist: z.array(z.string().min(1)).optional(),
  mode: SourceMode.default("live"),
}).strict();

export const ResearchSearchOutput = z.object({
  query: z.string(),
  mode: SourceMode,
  results: z.array(SourceSearchResult),
  warnings: z.array(z.string()),
  artifact_id: z.string().optional(),
}).strict();

export const ResearchFetchSourceInput = z.object({
  url: z.string().min(1),
  source_id: z.string().optional(),
  max_bytes: z.number().int().min(1_000).max(2_000_000).default(500_000),
  timeout_ms: z.number().int().min(500).max(30_000).default(8_000),
  accepted_content_types: z.array(z.string().min(1)).default(["text/html", "text/plain", "text/markdown", "application/xhtml+xml"]),
  mode: SourceMode.default("live"),
}).strict();

export const ResearchFetchSourceOutput = z.object({
  source_id: z.string(),
  url: z.string(),
  final_url: z.string().optional(),
  status_code: z.number().int().optional(),
  content_type: z.string().optional(),
  fetched_at: z.string().datetime(),
  title: z.string().optional(),
  raw_artifact_id: z.string().optional(),
  text_artifact_id: z.string().optional(),
  size_bytes: z.number().int().min(0).optional(),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
  policy_report_id: z.string().optional(),
}).strict();

export const ExtractContentInput = z.object({
  source_artifact_id: z.string().optional(),
  html: z.string().optional(),
  markdown: z.string().optional(),
  text: z.string().optional(),
  url: z.string().url().optional(),
  max_chars: z.number().int().min(100).max(200_000).default(20_000),
}).strict().refine((input) => Boolean(input.source_artifact_id || input.html || input.markdown || input.text), {
  message: "Provide source_artifact_id, html, markdown, or text.",
});

export const ExtractedSource = z.object({
  source_id: z.string().min(1),
  title: z.string().optional(),
  byline: z.string().optional(),
  site_name: z.string().optional(),
  published_at: z.string().datetime().optional(),
  url: z.string().url(),
  domain: z.string().min(1),
  extracted_text: z.string().min(1),
  excerpt: z.string(),
  word_count: z.number().int().min(0),
  truncated: z.boolean(),
  citation: Citation,
  artifact_id: z.string(),
  warnings: z.array(z.string()),
}).strict();

export const ExtractContentOutput = ExtractedSource;

export const SourceSummary = z.object({
  source_id: z.string(),
  title: z.string(),
  url: z.string().url(),
  domain: z.string(),
  citation_id: z.string(),
  source_type: SourceType.optional(),
}).strict();

export const SourceRejection = z.object({
  source_id: z.string(),
  reason: z.string(),
}).strict();

export const CreateSourceSetInput = z.object({
  topic: z.string().min(1),
  sources: z.array(ExtractedSource).min(1),
  selection_policy: z.object({
    min_sources: z.number().int().min(1).optional(),
    max_sources: z.number().int().min(1).max(25).optional(),
    prefer_official: z.boolean().optional(),
    require_diverse_domains: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const CreateSourceSetOutput = z.object({
  source_set_id: z.string(),
  topic: z.string(),
  selected_sources: z.array(SourceSummary),
  rejected_sources: z.array(SourceRejection),
  artifact_id: z.string(),
  warnings: z.array(z.string()),
}).strict();

export const SourceCoverage = z.object({
  source_id: z.string(),
  citation_id: z.string(),
  used_for: z.array(z.string()),
}).strict();

export const CreateBriefInput = z.object({
  topic: z.string().min(1),
  source_set_id: z.string().optional(),
  sources: z.array(ExtractedSource).min(1),
  brief_style: z.enum(["concise", "standard", "technical", "executive"]).default("standard"),
  include_recommendations: z.boolean().default(false),
  max_words: z.number().int().min(100).max(3000).default(800),
}).strict();

export const CreateBriefOutput = z.object({
  brief_id: z.string(),
  topic: z.string(),
  markdown: z.string().min(1),
  citations: z.array(Citation).min(1),
  source_coverage: z.array(SourceCoverage),
  artifact_id: z.string(),
  warnings: z.array(z.string()),
}).strict();

export const ExportMarkdownInput = z.object({
  title: z.string().min(1),
  markdown: z.string().min(1),
  related_source_ids: z.array(z.string()).default([]),
}).strict();

export const ExportMarkdownOutput = z.object({
  artifact_id: z.string(),
  title: z.string(),
  path_or_uri: z.string(),
  related_source_ids: z.array(z.string()),
}).strict();

export type SourceMode = z.infer<typeof SourceMode>;
export type SourceSearchResult = z.infer<typeof SourceSearchResult>;
export type ResearchSearchInput = z.infer<typeof ResearchSearchInput>;
export type ResearchSearchOutput = z.infer<typeof ResearchSearchOutput>;
export type ResearchFetchSourceInput = z.infer<typeof ResearchFetchSourceInput>;
export type ResearchFetchSourceOutput = z.infer<typeof ResearchFetchSourceOutput>;
export type ExtractContentInput = z.infer<typeof ExtractContentInput>;
export type ExtractedSource = z.infer<typeof ExtractedSource>;
export type ExtractContentOutput = z.infer<typeof ExtractContentOutput>;
export type Citation = z.infer<typeof Citation>;
export type SourceSummary = z.infer<typeof SourceSummary>;
export type SourceRejection = z.infer<typeof SourceRejection>;
export type CreateSourceSetInput = z.infer<typeof CreateSourceSetInput>;
export type CreateSourceSetOutput = z.infer<typeof CreateSourceSetOutput>;
export type CreateBriefInput = z.infer<typeof CreateBriefInput>;
export type CreateBriefOutput = z.infer<typeof CreateBriefOutput>;
export type ExportMarkdownInput = z.infer<typeof ExportMarkdownInput>;
export type ExportMarkdownOutput = z.infer<typeof ExportMarkdownOutput>;
