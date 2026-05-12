import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { artifacts, createPrimitiveContext, type PackExecutionContext, type PrimitiveArtifactSummary } from "@open-lagrange/capability-sdk";
import { showArtifact, type ArtifactSummary } from "../../artifacts/index.js";
import { listModelRouteConfigs } from "../../evals/model-route-config.js";
import { stableHash } from "../../util/hash.js";
import { OUTPUT_PACK_ID } from "./manifest.js";
import { selectArtifacts, selectionIdFor } from "./artifact-selector.js";
import { markdownFromInput } from "./markdown-renderer.js";
import { renderMarkdownToHtml } from "./html-renderer.js";
import { renderPdfUnsupported } from "./pdf-renderer.js";
import { createRunDigest } from "./run-digest.js";
import { buildRunPacket } from "./report-builder.js";
import { writeDirectoryExport, writeZipExport } from "./archive-writer.js";
import type {
  CreateDigestInput,
  CreateDigestOutput,
  CreateManifestInput,
  CreateManifestOutput,
  CreateRunPacketInput,
  CreateRunPacketOutput,
  ExportArtifactsInput,
  ExportArtifactsOutput,
  RenderHtmlInput,
  RenderHtmlOutput,
  RenderMarkdownInput,
  RenderMarkdownOutput,
  RenderPdfInput,
  RenderPdfOutput,
  SelectArtifactsInput,
  SelectArtifactsOutput,
} from "./schemas.js";

export async function runOutputSelectArtifacts(context: PackExecutionContext, input: SelectArtifactsInput): Promise<SelectArtifactsOutput> {
  const selection = await selectArtifacts(input, artifactIndexPath(context));
  const selectionId = selectionIdFor(input);
  const artifact = await writeOutputArtifact(context, {
    capability_id: "output.select_artifacts",
    artifact_id: selectionId,
    kind: "artifact_selection",
    title: "Artifact Selection",
    summary: `Selected ${selection.selected_artifacts.length} artifact(s) for output.`,
    content: { selection_id: selectionId, ...selection },
    content_type: "application/json",
    input_artifact_refs: selection.selected_artifacts.map((item) => item.artifact_id),
    output_format: "json",
  });
  return {
    selection_id: selectionId,
    selected_artifacts: selection.selected_artifacts,
    excluded_artifacts: selection.excluded_artifacts,
    warnings: selection.warnings,
    artifact_id: artifact.artifact_id,
  };
}

export async function runOutputCreateDigest(context: PackExecutionContext, input: CreateDigestInput): Promise<CreateDigestOutput> {
  const selection = await selectArtifacts({
    run_id: input.run_id,
    artifact_ids: input.artifact_ids,
    preset: "all_safe",
    include_model_calls: false,
    include_raw_logs: false,
    include_redacted_only: true,
    max_artifacts: 80,
  }, artifactIndexPath(context));
  const digest = await createRunDigest({
    artifacts: selection.selected_artifacts,
    style: input.digest_style,
    max_words: input.max_words,
    deterministic: input.deterministic,
    model: input.model,
    ...(input.model_route_id ? { model_route_id: input.model_route_id } : {}),
    ...modelContext(context),
  });
  const artifact = await writeOutputArtifact(context, {
    capability_id: "output.create_digest",
    artifact_id: digest.digest_id,
    kind: "run_digest",
    title: titleForDigest(input.digest_style),
    summary: `Digest generated from ${selection.selected_artifacts.length} artifact(s).`,
    content: digest.markdown,
    content_type: "text/markdown",
    input_artifact_refs: selection.selected_artifacts.map((item) => item.artifact_id),
    output_format: "markdown",
  });
  return {
    digest_id: digest.digest_id,
    markdown: digest.markdown,
    source_artifact_ids: selection.selected_artifacts.map((item) => item.artifact_id),
    artifact_id: artifact.artifact_id,
    warnings: [...selection.warnings, ...digest.warnings],
    generation_mode: digest.generation_mode,
  };
}

export async function runOutputCreateRunPacket(context: PackExecutionContext, input: CreateRunPacketInput): Promise<CreateRunPacketOutput> {
  const preset = input.packet_type === "research"
    ? "research_packet"
    : input.packet_type === "developer"
      ? "developer_packet"
      : input.packet_type === "debug"
        ? "debug_packet"
        : "final_outputs";
  const selection = await selectArtifacts({
    run_id: input.run_id,
    preset,
    include_model_calls: input.include_model_calls,
    include_raw_logs: input.include_raw_logs,
    include_redacted_only: true,
    max_artifacts: 120,
  }, artifactIndexPath(context));
  const packet = await buildRunPacket({
    run_id: input.run_id,
    packet_type: input.packet_type,
    artifacts: selection.selected_artifacts,
    excluded_artifacts: selection.excluded_artifacts,
    deterministic: input.deterministic,
    model: input.model,
    ...(input.model_route_id ? { model_route_id: input.model_route_id } : {}),
    ...modelContext(context),
  });
  const markdownArtifact = await writeOutputArtifact(context, {
    capability_id: "output.create_run_packet",
    artifact_id: packet.packet_id,
    kind: "run_packet",
    title: packetTitle(input.packet_type),
    summary: `${input.packet_type} packet for run ${input.run_id}.`,
    content: packet.markdown,
    content_type: "text/markdown",
    input_artifact_refs: selection.selected_artifacts.map((item) => item.artifact_id),
    output_format: "markdown",
  });
  const manifestArtifact = await writeOutputArtifact(context, {
    capability_id: "output.create_run_packet",
    artifact_id: `${packet.packet_id}_manifest`,
    kind: "artifact_manifest",
    title: "Run Packet Manifest",
    summary: `Manifest for ${packet.packet_id}.`,
    content: packet.manifest,
    content_type: "application/json",
    input_artifact_refs: selection.selected_artifacts.map((item) => item.artifact_id),
    output_format: "json",
  });
  return {
    packet_id: packet.packet_id,
    markdown_artifact_id: markdownArtifact.artifact_id,
    json_manifest_artifact_id: manifestArtifact.artifact_id,
    included_artifact_ids: selection.selected_artifacts.map((item) => item.artifact_id),
    excluded_artifacts: selection.excluded_artifacts,
    warnings: [...selection.warnings, ...packet.warnings],
    generation_mode: packet.generation_mode,
  };
}

export async function runOutputRenderMarkdown(context: PackExecutionContext, input: RenderMarkdownInput): Promise<RenderMarkdownOutput> {
  const indexPath = artifactIndexPath(context);
  const markdown = markdownFromInput({
    ...(input.markdown ? { markdown: input.markdown } : {}),
    ...(input.source_artifact_id ? { source_artifact_id: input.source_artifact_id } : {}),
    ...(input.title ? { title: input.title } : {}),
    normalize: input.normalize,
    ...(indexPath ? { index_path: indexPath } : {}),
  });
  const artifactId = `markdown_export_${stableHash({ title: markdown.title, refs: markdown.input_artifact_refs, markdown: markdown.markdown }).slice(0, 18)}`;
  const artifact = await writeOutputArtifact(context, {
    capability_id: "output.render_markdown",
    artifact_id: artifactId,
    kind: "markdown_export",
    title: markdown.title,
    summary: `Markdown export for ${markdown.title}.`,
    content: markdown.markdown,
    content_type: "text/markdown",
    input_artifact_refs: markdown.input_artifact_refs,
    output_format: "markdown",
  });
  return { artifact_id: artifact.artifact_id, title: markdown.title, content_type: "text/markdown", path_or_uri: artifact.path_or_uri ?? artifact.artifact_id };
}

export async function runOutputRenderHtml(context: PackExecutionContext, input: RenderHtmlInput): Promise<RenderHtmlOutput> {
  const indexPath = artifactIndexPath(context);
  const markdown = markdownFromInput({
    ...(input.markdown ? { markdown: input.markdown } : {}),
    ...(input.source_markdown_artifact_id ? { source_artifact_id: input.source_markdown_artifact_id } : {}),
    ...(input.title ? { title: input.title } : {}),
    normalize: true,
    ...(indexPath ? { index_path: indexPath } : {}),
  });
  const html = renderMarkdownToHtml({ markdown: markdown.markdown, title: markdown.title, include_basic_styles: input.include_basic_styles });
  const artifactId = `html_export_${stableHash({ title: markdown.title, refs: markdown.input_artifact_refs, html }).slice(0, 18)}`;
  const artifact = await writeOutputArtifact(context, {
    capability_id: "output.render_html",
    artifact_id: artifactId,
    kind: "html_export",
    title: markdown.title,
    summary: `Sanitized HTML export for ${markdown.title}.`,
    content: html,
    content_type: "text/html",
    input_artifact_refs: markdown.input_artifact_refs,
    output_format: "html",
  });
  return { artifact_id: artifact.artifact_id, title: markdown.title, content_type: "text/html", path_or_uri: artifact.path_or_uri ?? artifact.artifact_id };
}

export async function runOutputRenderPdf(_context: PackExecutionContext, _input: RenderPdfInput): Promise<RenderPdfOutput> {
  return renderPdfUnsupported();
}

export async function runOutputExportArtifacts(context: PackExecutionContext, input: ExportArtifactsInput): Promise<ExportArtifactsOutput> {
  const resolved = resolveArtifactIds(input.artifact_ids, artifactIndexPath(context));
  const manifest = artifactManifest({
    artifacts: resolved,
    include_lineage: true,
    include_checksums: true,
    manifest_id: `artifact_manifest_${stableHash({ artifacts: input.artifact_ids, format: input.format }).slice(0, 18)}`,
    generated_by: "output.export_artifacts",
  });
  const manifestArtifact = input.include_manifest
    ? await writeOutputArtifact(context, {
      capability_id: "output.export_artifacts",
      artifact_id: String(manifest.manifest_id),
      kind: "artifact_manifest",
      title: "Artifact Export Manifest",
      summary: `Manifest for ${resolved.length} exported artifact(s).`,
      content: manifest,
      content_type: "application/json",
      input_artifact_refs: resolved.map((artifact) => artifact.artifact_id),
      output_format: "json",
    })
    : undefined;
  const exportId = `artifact_export_${stableHash({ artifacts: input.artifact_ids, format: input.format, path: input.output_path }).slice(0, 18)}`;
  if (input.format === "json_manifest") {
    return {
      export_id: exportId,
      ...(manifestArtifact ? { artifact_id: manifestArtifact.artifact_id, manifest_artifact_id: manifestArtifact.artifact_id } : {}),
      exported_files: manifestArtifact?.path_or_uri ? [manifestArtifact.path_or_uri] : [],
      warnings: [],
      status: "success",
    };
  }
  const outputPath = input.output_path ?? join(".open-lagrange", "exports", exportId + (input.format === "zip" ? ".zip" : ""));
  const indexPath = artifactIndexPath(context);
  const exportedFiles = input.format === "zip"
    ? [await writeZipExport({ artifacts: resolved, output_path: outputPath, manifest, ...(indexPath ? { index_path: indexPath } : {}) })]
    : [...await writeDirectoryExport({ artifacts: resolved, output_path: outputPath, manifest, ...(indexPath ? { index_path: indexPath } : {}) })];
  const bundleArtifact = await writeOutputArtifact(context, {
    capability_id: "output.export_artifacts",
    artifact_id: exportId,
    kind: input.format === "zip" ? "zip_export" : "artifact_bundle",
    title: input.format === "zip" ? "ZIP Artifact Export" : "Artifact Directory Export",
    summary: `Exported ${resolved.length} artifact(s) as ${input.format}.`,
    content: { export_id: exportId, output_path: outputPath, exported_files: exportedFiles, manifest_artifact_id: manifestArtifact?.artifact_id },
    content_type: "application/json",
    input_artifact_refs: resolved.map((artifact) => artifact.artifact_id),
    output_format: input.format,
  });
  return {
    export_id: exportId,
    artifact_id: bundleArtifact.artifact_id,
    output_path: outputPath,
    exported_files: exportedFiles,
    ...(manifestArtifact ? { manifest_artifact_id: manifestArtifact.artifact_id } : {}),
    warnings: [],
    status: "success",
  };
}

export async function runOutputCreateManifest(context: PackExecutionContext, input: CreateManifestInput): Promise<CreateManifestOutput> {
  const resolved = resolveArtifactIds(input.artifact_ids, artifactIndexPath(context));
  const manifestId = `artifact_manifest_${stableHash(input).slice(0, 18)}`;
  const manifest = artifactManifest({
    artifacts: resolved,
    include_lineage: input.include_lineage,
    include_checksums: input.include_checksums,
    manifest_id: manifestId,
    generated_by: "output.create_manifest",
  });
  const artifact = await writeOutputArtifact(context, {
    capability_id: "output.create_manifest",
    artifact_id: manifestId,
    kind: "artifact_manifest",
    title: "Artifact Manifest",
    summary: `Manifest for ${resolved.length} artifact(s).`,
    content: manifest,
    content_type: "application/json",
    input_artifact_refs: resolved.map((item) => item.artifact_id),
    output_format: "json",
  });
  return { manifest_id: manifestId, artifact_id: artifact.artifact_id, artifact_count: resolved.length };
}

function artifactIndexPath(context: PackExecutionContext): string | undefined {
  return typeof context.runtime_config.artifact_index_path === "string" ? context.runtime_config.artifact_index_path : undefined;
}

function artifactDir(context: PackExecutionContext): string | undefined {
  return typeof context.runtime_config.artifact_dir === "string" ? context.runtime_config.artifact_dir : undefined;
}

function modelContext(context: PackExecutionContext): {
  readonly artifact_dir?: string;
  readonly artifact_index_path?: string;
  readonly model_route_id?: string;
  readonly plan_id?: string;
  readonly node_id?: string;
} {
  const route = context.runtime_config.model_route && typeof context.runtime_config.model_route === "object"
    ? context.runtime_config.model_route as { readonly route_id?: unknown }
    : listModelRouteConfigs()[0];
  const dir = artifactDir(context);
  const indexPath = artifactIndexPath(context);
  return {
    ...(dir ? { artifact_dir: dir } : {}),
    ...(indexPath ? { artifact_index_path: indexPath } : {}),
    ...(typeof route?.route_id === "string" ? { model_route_id: route.route_id } : {}),
  };
}

async function writeOutputArtifact(context: PackExecutionContext, input: {
  readonly capability_id: string;
  readonly artifact_id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly content: unknown;
  readonly content_type: string;
  readonly input_artifact_refs?: readonly string[];
  readonly output_format: string;
}): Promise<PrimitiveArtifactSummary> {
  const primitive = createPrimitiveContext(context, {
    pack_id: OUTPUT_PACK_ID,
    capability_id: input.capability_id,
    ...(typeof context.runtime_config.plan_id === "string" ? { plan_id: context.runtime_config.plan_id } : {}),
    ...(typeof context.runtime_config.node_id === "string" ? { node_id: context.runtime_config.node_id } : {}),
    ...(context.runtime_config.artifact_store ? { artifact_store: context.runtime_config.artifact_store as NonNullable<Parameters<typeof createPrimitiveContext>[1]["artifact_store"]> } : {}),
  });
  return artifacts.write(primitive, {
    artifact_id: input.artifact_id,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    content: input.content,
    content_type: input.content_type,
    input_artifact_refs: input.input_artifact_refs ?? [],
    output_artifact_refs: [input.artifact_id],
    validation_status: "pass",
    redaction_status: "redacted",
    metadata: {
      produced_by_pack_id: OUTPUT_PACK_ID,
      produced_by_capability_id: input.capability_id,
      output_format: input.output_format,
      checksum_sha256: checksum(input.content),
    },
  });
}

function resolveArtifactIds(artifactIds: readonly string[], indexPath: string | undefined): readonly ArtifactSummary[] {
  return artifactIds.map((artifactId) => {
    const shown = showArtifact(artifactId, indexPath);
    if (!shown) throw new Error(`Artifact not found: ${artifactId}`);
    if (shown.summary.restricted) throw new Error(`Artifact is restricted and cannot be exported: ${artifactId}`);
    return shown.summary;
  });
}

function artifactManifest(input: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly include_lineage: boolean;
  readonly include_checksums: boolean;
  readonly manifest_id: string;
  readonly generated_by: string;
}): Record<string, unknown> {
  return {
    schema_version: "open-lagrange.artifact-manifest.v1",
    manifest_id: input.manifest_id,
    generated_by_pack_id: OUTPUT_PACK_ID,
    generated_by_capability_id: input.generated_by,
    artifact_count: input.artifacts.length,
    generated_at: new Date().toISOString(),
    artifacts: input.artifacts.map((artifact) => ({
      artifact_id: artifact.artifact_id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      content_type: artifact.content_type,
      output_format: artifact.output_format,
      path_or_uri: artifact.path_or_uri,
      ...(input.include_checksums ? { checksum_sha256: artifact.checksum_sha256 ?? checksum(showArtifact(artifact.artifact_id)?.content) } : {}),
      ...(input.include_lineage ? {
        produced_by_pack_id: artifact.produced_by_pack_id,
        produced_by_capability_id: artifact.produced_by_capability_id,
        input_artifact_refs: artifact.input_artifact_refs ?? [],
        output_artifact_refs: artifact.output_artifact_refs ?? [],
      } : {}),
    })),
  };
}

function checksum(value: unknown): string {
  const content = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(content).digest("hex");
}

function titleForDigest(style: string): string {
  if (style === "executive") return "Executive Run Digest";
  if (style === "developer") return "Developer Run Digest";
  if (style === "research") return "Research Run Digest";
  return "Run Digest";
}

function packetTitle(type: string): string {
  if (type === "research") return "Research Run Packet";
  if (type === "developer") return "Developer Handoff Report";
  if (type === "debug") return "Debug Run Packet";
  return "Run Packet";
}
