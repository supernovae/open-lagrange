import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { createArtifactSummary, registerArtifacts, type ArtifactSummary } from "../artifacts/index.js";
import type { ExecutionMode } from "../runtime/execution-mode.js";
import { sourceModeWarning } from "../runtime/execution-mode.js";
import { stableHash } from "../util/hash.js";

export interface LocalPlanArtifactStore {
  readonly output_dir: string;
  readonly recordArtifact: (artifact: unknown) => Promise<void>;
  readonly readMetadata: (artifact_id: string) => Promise<unknown | undefined>;
  readonly link: (from_artifact_id: string, to_artifact_id: string, metadata?: Record<string, unknown>) => Promise<void>;
  readonly flush: (indexPath?: string) => readonly ArtifactSummary[];
  readonly summaries: readonly ArtifactSummary[];
}

export function createLocalPlanArtifactStore(input: {
  readonly plan_id: string;
  readonly output_dir?: string;
  readonly now?: string;
}): LocalPlanArtifactStore {
  const outputDir = input.output_dir ?? join(".open-lagrange", "plans", input.plan_id, "artifacts");
  const payloads = new Map<string, unknown>();
  const summaries = new Map<string, ArtifactSummary>();
  const links: Array<{ readonly from: string; readonly to: string; readonly metadata: Record<string, unknown> }> = [];

  return {
    output_dir: outputDir,
    summaries: [...summaries.values()],
    async recordArtifact(artifact: unknown): Promise<void> {
      const record = artifact && typeof artifact === "object" ? artifact as Record<string, unknown> : {};
      const artifactId = stringValue(record.artifact_id) ?? `artifact_${stableHash(record).slice(0, 16)}`;
      const kind = stringValue(record.kind) ?? "raw_log";
      const content = record.content ?? record;
      const contentType = stringValue(record.content_type) ?? contentTypeForContent(content);
      const extension = extensionForContentType(contentType);
      const path = join(outputDir, `${safeFileName(artifactId)}.${extension}`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
      payloads.set(artifactId, { ...record, path_or_uri: path });

      const lineage = objectValue(record.lineage);
      const metadata = objectValue(record.metadata);
      summaries.set(artifactId, createArtifactSummary({
        artifact_id: artifactId,
        kind: kind as ArtifactSummary["kind"],
        title: stringValue(record.title) ?? artifactId,
        summary: stringValue(record.summary) ?? `${kind} artifact`,
        path_or_uri: path,
        content_type: contentType,
        ...optionalString("related_plan_id", stringValue(lineage.produced_by_plan_id)),
        ...optionalString("related_pack_id", stringValue(lineage.produced_by_pack_id)),
        ...optionalString("produced_by_pack_id", stringValue(lineage.produced_by_pack_id)),
        ...optionalString("produced_by_capability_id", stringValue(lineage.produced_by_capability_id)),
        ...optionalString("produced_by_plan_id", stringValue(lineage.produced_by_plan_id)),
        ...optionalString("produced_by_node_id", stringValue(lineage.produced_by_node_id)),
        ...optionalArray("input_artifact_refs", stringArray(lineage.input_artifact_refs)),
        ...optionalArray("output_artifact_refs", stringArray(lineage.output_artifact_refs)),
        ...optionalSourceMode(sourceMode(record, metadata)),
        ...optionalExecutionMode(executionMode(record, metadata)),
        ...optionalString("fixture_id", stringValue(record.fixture_id) ?? stringValue(metadata.fixture_id)),
        ...optionalString("fixture_set", stringValue(record.fixture_set) ?? stringValue(metadata.fixture_set)),
        ...optionalBoolean("live", booleanValue(record.live) ?? booleanValue(metadata.live)),
        ...optionalString("mode_warning", stringValue(record.mode_warning) ?? stringValue(metadata.mode_warning) ?? modeWarning(record, metadata)),
        validation_status: stringValue(record.validation_status) ?? "not_applicable",
        redaction_status: redactionStatus(record.redaction_status),
        ...optionalBoolean("restricted", booleanValue(record.restricted) ?? booleanValue(metadata.restricted)),
        ...optionalString("output_format", stringValue(record.output_format) ?? stringValue(metadata.output_format)),
        ...optionalString("checksum_sha256", stringValue(record.checksum_sha256) ?? stringValue(metadata.checksum_sha256)),
        ...(input.now ? { created_at: input.now } : {}),
      }));
    },
    async readMetadata(artifact_id: string): Promise<unknown | undefined> {
      const payload = payloads.get(artifact_id);
      if (payload) return payload;
      const summary = summaries.get(artifact_id);
      if (!summary || !existsSync(summary.path_or_uri)) return undefined;
      const text = readFileSync(summary.path_or_uri, "utf8");
      return {
        ...summary,
        content: summary.content_type?.includes("json") ? parseJsonOrText(text) : text,
      };
    },
    async link(from_artifact_id: string, to_artifact_id: string, metadata: Record<string, unknown> = {}): Promise<void> {
      links.push({ from: from_artifact_id, to: to_artifact_id, metadata });
    },
    flush(indexPath?: string): readonly ArtifactSummary[] {
      const values = [...summaries.values()];
      if (values.length > 0) registerArtifacts({ artifacts: values, ...(indexPath ? { index_path: indexPath } : {}) });
      return values;
    },
  };
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function contentTypeForContent(content: unknown): string {
  return typeof content === "string" ? "text/plain" : "application/json";
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("markdown")) return "md";
  if (contentType.includes("html")) return "html";
  if (contentType.includes("plain")) return "txt";
  if (contentType.includes("patch")) return "patch";
  return extname(contentType).replace(/^\./, "") || "json";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return strings.length > 0 ? strings : undefined;
}

function optionalString(key: string, value: string | undefined): Record<string, string> {
  return value ? { [key]: value } : {};
}

function optionalArray(key: string, value: string[] | undefined): Record<string, string[]> {
  return value ? { [key]: value } : {};
}

function optionalSourceMode(value: ExecutionMode | undefined): { readonly source_mode?: ExecutionMode } {
  return value ? { source_mode: value } : {};
}

function optionalExecutionMode(value: ExecutionMode | undefined): { readonly execution_mode?: ExecutionMode } {
  return value ? { execution_mode: value } : {};
}

function optionalBoolean(key: string, value: boolean | undefined): Record<string, boolean> {
  return typeof value === "boolean" ? { [key]: value } : {};
}

function sourceMode(record: Record<string, unknown>, metadata: Record<string, unknown>): ExecutionMode | undefined {
  const value = stringValue(record.source_mode) ?? stringValue(metadata.source_mode) ?? stringValue(metadata.mode);
  return executionModeValue(value);
}

function executionMode(record: Record<string, unknown>, metadata: Record<string, unknown>): ExecutionMode | undefined {
  return executionModeValue(stringValue(record.execution_mode) ?? stringValue(metadata.execution_mode) ?? stringValue(record.source_mode) ?? stringValue(metadata.source_mode) ?? stringValue(metadata.mode));
}

function executionModeValue(value: string | undefined): ExecutionMode | undefined {
  if (value === "live" || value === "dry_run" || value === "fixture" || value === "mock" || value === "test") return value;
  return undefined;
}

function modeWarning(record: Record<string, unknown>, metadata: Record<string, unknown>): string | undefined {
  const mode = sourceMode(record, metadata) ?? executionMode(record, metadata);
  return mode ? sourceModeWarning(mode) : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function redactionStatus(value: unknown): "redacted" | "not_redacted" | "unknown" {
  if (value === "redacted") return "redacted";
  if (value === "not_redacted" || value === "not_required") return "not_redacted";
  return "unknown";
}

function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
