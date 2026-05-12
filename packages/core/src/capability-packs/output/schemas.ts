import { z } from "zod";
import { ArtifactSummary } from "../../artifacts/artifact-model.js";

export const OutputPreset = z.enum(["final_outputs", "research_packet", "developer_packet", "debug_packet", "all_safe"]);
export const PacketType = z.enum(["research", "developer", "debug", "general"]);
export const DigestStyle = z.enum(["concise", "executive", "developer", "research"]);
export const GenerationMode = z.enum(["model", "deterministic_fallback", "deterministic_requested"]);
export const ExcludedArtifactReason = z.enum(["kind_excluded", "redaction_required", "restricted", "raw_log_excluded", "model_call_excluded", "limit_exceeded", "not_found"]);

export const ExcludedArtifact = z.object({
  artifact_id: z.string().min(1),
  reason: ExcludedArtifactReason,
}).strict();

export const ArtifactSelectionInput = z.object({
  run_id: z.string().min(1).optional(),
  plan_id: z.string().min(1).optional(),
  artifact_ids: z.array(z.string().min(1)).optional(),
  include_kinds: z.array(z.string().min(1)).optional(),
  exclude_kinds: z.array(z.string().min(1)).optional(),
  include_model_calls: z.boolean().default(false),
  include_raw_logs: z.boolean().default(false),
  include_redacted_only: z.boolean().default(true),
  max_artifacts: z.number().int().min(1).max(500).default(50),
  preset: OutputPreset.default("final_outputs"),
}).strict();

export const ArtifactSelectionResult = z.object({
  selected_artifacts: z.array(ArtifactSummary),
  excluded_artifacts: z.array(ExcludedArtifact),
  warnings: z.array(z.string()),
}).strict();

export const SelectArtifactsInput = ArtifactSelectionInput;
export const SelectArtifactsOutput = ArtifactSelectionResult.extend({
  selection_id: z.string().min(1),
  artifact_id: z.string().min(1),
}).strict();

export const CreateDigestInput = z.object({
  run_id: z.string().min(1).optional(),
  artifact_ids: z.array(z.string().min(1)).optional(),
  digest_style: DigestStyle.default("concise"),
  max_words: z.number().int().min(50).max(2000).default(400),
  deterministic: z.boolean().default(false),
  model: z.boolean().default(false),
  model_route_id: z.string().min(1).optional(),
}).strict();

export const CreateDigestOutput = z.object({
  digest_id: z.string().min(1),
  markdown: z.string().min(1),
  source_artifact_ids: z.array(z.string().min(1)),
  artifact_id: z.string().min(1),
  warnings: z.array(z.string()),
  generation_mode: GenerationMode,
}).strict();

export const CreateRunPacketInput = z.object({
  run_id: z.string().min(1),
  packet_type: PacketType,
  include_timeline: z.boolean().default(true),
  include_model_calls: z.boolean().default(false),
  include_policy_reports: z.boolean().default(false),
  include_raw_logs: z.boolean().default(false),
  deterministic: z.boolean().default(false),
  model: z.boolean().default(false),
  model_route_id: z.string().min(1).optional(),
}).strict();

export const CreateRunPacketOutput = z.object({
  packet_id: z.string().min(1),
  markdown_artifact_id: z.string().min(1),
  json_manifest_artifact_id: z.string().min(1),
  included_artifact_ids: z.array(z.string().min(1)),
  excluded_artifacts: z.array(ExcludedArtifact),
  warnings: z.array(z.string()),
  generation_mode: GenerationMode,
}).strict();

export const RenderMarkdownInput = z.object({
  title: z.string().min(1).optional(),
  markdown: z.string().min(1).optional(),
  source_artifact_id: z.string().min(1).optional(),
  normalize: z.boolean().default(true),
}).strict().refine((input) => Boolean(input.markdown || input.source_artifact_id), {
  message: "Provide markdown or source_artifact_id.",
});

export const RenderMarkdownOutput = z.object({
  artifact_id: z.string().min(1),
  title: z.string().min(1),
  content_type: z.literal("text/markdown"),
  path_or_uri: z.string().min(1),
}).strict();

export const RenderHtmlInput = z.object({
  source_markdown_artifact_id: z.string().min(1).optional(),
  markdown: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  include_basic_styles: z.boolean().default(true),
}).strict().refine((input) => Boolean(input.markdown || input.source_markdown_artifact_id), {
  message: "Provide markdown or source_markdown_artifact_id.",
});

export const RenderHtmlOutput = z.object({
  artifact_id: z.string().min(1),
  title: z.string().min(1),
  content_type: z.literal("text/html"),
  path_or_uri: z.string().min(1),
}).strict();

export const RenderPdfInput = z.object({
  source_markdown_artifact_id: z.string().min(1).optional(),
  source_html_artifact_id: z.string().min(1).optional(),
  markdown: z.string().optional(),
  html: z.string().optional(),
  title: z.string().min(1).optional(),
}).strict();

export const RenderPdfOutput = z.object({
  status: z.enum(["success", "unsupported", "failed"]),
  artifact_id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  content_type: z.literal("application/pdf").optional(),
  path_or_uri: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  alternatives: z.array(z.enum(["markdown", "html", "zip"])).optional(),
}).strict();

export const ExportArtifactsInput = z.object({
  artifact_ids: z.array(z.string().min(1)).min(1),
  output_path: z.string().min(1).optional(),
  format: z.enum(["directory", "zip", "json_manifest"]),
  include_manifest: z.boolean().default(true),
}).strict();

export const ExportArtifactsOutput = z.object({
  export_id: z.string().min(1),
  artifact_id: z.string().min(1).optional(),
  output_path: z.string().min(1).optional(),
  exported_files: z.array(z.string().min(1)),
  manifest_artifact_id: z.string().min(1).optional(),
  warnings: z.array(z.string()),
  status: z.enum(["success", "unsupported"]).default("success"),
  alternatives: z.array(z.enum(["directory", "json_manifest"])).optional(),
}).strict();

export const CreateManifestInput = z.object({
  artifact_ids: z.array(z.string().min(1)).min(1),
  include_lineage: z.boolean().default(true),
  include_checksums: z.boolean().default(true),
}).strict();

export const CreateManifestOutput = z.object({
  manifest_id: z.string().min(1),
  artifact_id: z.string().min(1),
  artifact_count: z.number().int().min(0),
}).strict();

export type OutputPreset = z.infer<typeof OutputPreset>;
export type PacketType = z.infer<typeof PacketType>;
export type DigestStyle = z.infer<typeof DigestStyle>;
export type GenerationMode = z.infer<typeof GenerationMode>;
export type ExcludedArtifact = z.infer<typeof ExcludedArtifact>;
export type ArtifactSelectionInput = z.infer<typeof ArtifactSelectionInput>;
export type ArtifactSelectionResult = z.infer<typeof ArtifactSelectionResult>;
export type SelectArtifactsInput = z.infer<typeof SelectArtifactsInput>;
export type SelectArtifactsOutput = z.infer<typeof SelectArtifactsOutput>;
export type CreateDigestInput = z.infer<typeof CreateDigestInput>;
export type CreateDigestOutput = z.infer<typeof CreateDigestOutput>;
export type CreateRunPacketInput = z.infer<typeof CreateRunPacketInput>;
export type CreateRunPacketOutput = z.infer<typeof CreateRunPacketOutput>;
export type RenderMarkdownInput = z.infer<typeof RenderMarkdownInput>;
export type RenderMarkdownOutput = z.infer<typeof RenderMarkdownOutput>;
export type RenderHtmlInput = z.infer<typeof RenderHtmlInput>;
export type RenderHtmlOutput = z.infer<typeof RenderHtmlOutput>;
export type RenderPdfInput = z.infer<typeof RenderPdfInput>;
export type RenderPdfOutput = z.infer<typeof RenderPdfOutput>;
export type ExportArtifactsInput = z.infer<typeof ExportArtifactsInput>;
export type ExportArtifactsOutput = z.infer<typeof ExportArtifactsOutput>;
export type CreateManifestInput = z.infer<typeof CreateManifestInput>;
export type CreateManifestOutput = z.infer<typeof CreateManifestOutput>;
