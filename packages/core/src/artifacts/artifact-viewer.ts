import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { ArtifactIndex, ArtifactKind, ArtifactSummary, type ArtifactKind as ArtifactKindType, type ArtifactSummary as ArtifactSummaryType } from "./artifact-model.js";
import { stripSecretValue } from "../secrets/secret-redaction.js";

export const DEFAULT_ARTIFACT_INDEX_PATH = ".open-lagrange/artifacts/index.json";

export function registerArtifacts(input: {
  readonly artifacts: readonly ArtifactSummaryType[];
  readonly index_path?: string;
  readonly now?: string;
}): ArtifactIndex {
  const now = input.now ?? new Date().toISOString();
  const indexPath = resolveLocalPath(input.index_path ?? DEFAULT_ARTIFACT_INDEX_PATH);
  const current = readArtifactIndex(indexPath);
  const byId = new Map(current.artifacts.map((artifact) => [artifact.artifact_id, artifact]));
  for (const artifact of input.artifacts) byId.set(artifact.artifact_id, ArtifactSummary.parse({ ...artifact, updated_at: now }));
  const next = ArtifactIndex.parse({
    schema_version: "open-lagrange.artifacts.v1",
    artifacts: [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at)),
    updated_at: now,
  });
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function listArtifacts(indexPath = DEFAULT_ARTIFACT_INDEX_PATH): readonly ArtifactSummaryType[] {
  return readArtifactIndex(resolveLocalPath(indexPath)).artifacts;
}

export function listArtifactsForPlan(planId: string, indexPath = DEFAULT_ARTIFACT_INDEX_PATH): readonly ArtifactSummaryType[] {
  return listArtifacts(indexPath).filter((artifact) =>
    artifact.related_plan_id === planId ||
    artifact.produced_by_plan_id === planId ||
    artifact.input_artifact_refs?.includes(planId) ||
    artifact.output_artifact_refs?.includes(planId),
  );
}

export function removeArtifactsByDemo(input: {
  readonly demo_id: string;
  readonly index_path?: string;
  readonly now?: string;
}): ArtifactIndex {
  const now = input.now ?? new Date().toISOString();
  const indexPath = resolveLocalPath(input.index_path ?? DEFAULT_ARTIFACT_INDEX_PATH);
  const current = readArtifactIndex(indexPath);
  const next = ArtifactIndex.parse({
    schema_version: "open-lagrange.artifacts.v1",
    artifacts: current.artifacts.filter((artifact) => artifact.related_demo_id !== input.demo_id),
    updated_at: now,
  });
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function showArtifact(artifactId: string, indexPath = DEFAULT_ARTIFACT_INDEX_PATH): { readonly summary: ArtifactSummaryType; readonly content: unknown } | undefined {
  const summary = listArtifacts(indexPath).find((artifact) => artifact.artifact_id === artifactId);
  if (!summary) return undefined;
  const path = resolvePath(summary.path_or_uri);
  if (!path || !existsSync(path)) return { summary, content: undefined };
  const text = readFileSync(path, "utf8");
  const parsed = parseContent(text, summary.content_type);
  return { summary, content: stripSecretValue(parsed) };
}

export function exportArtifact(input: {
  readonly artifact_id: string;
  readonly output_path: string;
  readonly index_path?: string;
}): ArtifactSummaryType {
  const summary = listArtifacts(input.index_path).find((artifact) => artifact.artifact_id === input.artifact_id);
  if (!summary) throw new Error(`Artifact not found: ${input.artifact_id}`);
  if (!summary.exportable) throw new Error(`Artifact is not exportable: ${input.artifact_id}`);
  const source = resolvePath(summary.path_or_uri);
  if (!source || !existsSync(source)) throw new Error(`Artifact file not found: ${summary.path_or_uri}`);
  mkdirSync(dirname(input.output_path), { recursive: true });
  copyFileSync(source, input.output_path);
  return summary;
}

export function pruneArtifacts(input: {
  readonly older_than: string;
  readonly index_path?: string;
  readonly now?: string;
}): {
  readonly pruned_count: number;
  readonly removed_files: readonly string[];
  readonly retained_count: number;
  readonly cutoff: string;
} {
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const cutoffMs = nowMs - parseDurationMs(input.older_than);
  const cutoff = new Date(cutoffMs).toISOString();
  const indexPath = resolveLocalPath(input.index_path ?? DEFAULT_ARTIFACT_INDEX_PATH);
  const current = readArtifactIndex(indexPath);
  const kept: ArtifactSummaryType[] = [];
  const removedFiles: string[] = [];
  for (const artifact of current.artifacts) {
    if (Date.parse(artifact.created_at) >= cutoffMs) {
      kept.push(artifact);
      continue;
    }
    const path = resolvePath(artifact.path_or_uri);
    if (path && isOpenLagrangePath(path) && existsSync(path)) {
      rmSync(path, { force: true });
      removedFiles.push(path);
    }
  }
  const next = ArtifactIndex.parse({
    schema_version: "open-lagrange.artifacts.v1",
    artifacts: kept,
    updated_at: input.now ?? new Date().toISOString(),
  });
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify(next, null, 2), "utf8");
  return {
    pruned_count: current.artifacts.length - kept.length,
    removed_files: removedFiles,
    retained_count: kept.length,
    cutoff,
  };
}

export function reindexArtifacts(input: {
  readonly roots?: readonly string[];
  readonly index_path?: string;
  readonly now?: string;
} = {}): ArtifactIndex {
  const now = input.now ?? new Date().toISOString();
  const roots = input.roots ?? [".open-lagrange/demos", ".open-lagrange/plans", ".open-lagrange/skills", ".open-lagrange/generated-packs", ".open-lagrange/research"];
  const artifacts: ArtifactSummaryType[] = [];
  for (const root of roots) {
    const absolute = resolveLocalPath(root);
    if (!existsSync(absolute)) continue;
    for (const path of walk(absolute)) {
      const kind = kindFromPath(path);
      if (!kind) continue;
      artifacts.push(summaryFromPath(path, kind, now));
    }
  }
  return registerArtifacts({ artifacts, ...(input.index_path ? { index_path: input.index_path } : {}), now });
}

export function createArtifactSummary(input: Omit<ArtifactSummaryType, "created_at" | "redacted" | "exportable" | "execution_mode"> & {
  readonly created_at?: string;
  readonly redacted?: boolean;
  readonly exportable?: boolean;
  readonly execution_mode?: ArtifactSummaryType["execution_mode"];
}): ArtifactSummaryType {
  const path = resolvePath(input.path_or_uri);
  const size = path && existsSync(path) ? statSync(path).size : undefined;
  return ArtifactSummary.parse({
    ...input,
    created_at: input.created_at ?? new Date().toISOString(),
    execution_mode: input.execution_mode ?? "live",
    redacted: input.redacted ?? true,
    redaction_status: input.redaction_status ?? (input.redacted === false ? "not_redacted" : "redacted"),
    exportable: input.exportable ?? true,
    ...(size === undefined ? {} : { size_bytes: size }),
  });
}

function readArtifactIndex(indexPath: string): ArtifactIndex {
  const path = resolveLocalPath(indexPath);
  if (!existsSync(path)) return ArtifactIndex.parse({ schema_version: "open-lagrange.artifacts.v1", artifacts: [], updated_at: new Date(0).toISOString() });
  try {
    return ArtifactIndex.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return ArtifactIndex.parse({ schema_version: "open-lagrange.artifacts.v1", artifacts: [], updated_at: new Date(0).toISOString() });
  }
}

function parseContent(text: string, contentType: string | undefined): unknown {
  if (contentType?.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function resolvePath(pathOrUri: string): string | undefined {
  if (pathOrUri.startsWith("file://")) return pathOrUri.slice("file://".length);
  if (/^[a-z]+:\/\//.test(pathOrUri)) return undefined;
  return resolveLocalPath(pathOrUri);
}

function walk(root: string): string[] {
  const stats = statSync(root);
  if (stats.isFile()) return [root];
  return readdirSync(root).flatMap((entry) => walk(join(root, entry)));
}

function kindFromPath(path: string): ArtifactKindType | undefined {
  const name = basename(path).toLowerCase();
  if (name.includes("planfile") || name.endsWith(".plan.md")) return "planfile";
  if (name.includes("skill-frame")) return "skill_frame";
  if (name.includes("workflow-skill") || name.endsWith(".skill.md")) return "workflow_skill";
  if (name.includes("build-plan")) return "pack_build_plan";
  if (name === "open-lagrange.pack.yaml") return "pack_manifest";
  if (name.includes("validation-report")) return "pack_validation_report";
  if (name.includes("test-report")) return "pack_test_report";
  if (name.includes("install-report")) return "pack_install_report";
  if (name.includes("smoke-report")) return "pack_smoke_report";
  if (name.includes("policy-decision")) return "policy_decision_report";
  if (name.includes("patch-plan")) return "patch_plan";
  if (name.includes("patch-artifact")) return "patch_artifact";
  if (name.includes("verification")) return "verification_report";
  if (name.includes("review")) return "review_report";
  if (name.includes("source-search-results") || name.includes("source_search_results")) return "source_search_results";
  if (name.includes("source-snapshot") || name.includes("source_snapshot")) return "source_snapshot";
  if (name.includes("source-text") || name.includes("source_text")) return "source_text";
  if (name.includes("source-set") || name.includes("source_set")) return "source_set";
  if (name.includes("research-brief")) return "research_brief";
  if (name.includes("citation-index") || name.includes("citation_index")) return "citation_index";
  if (name.includes("capability-step") || name.includes("capability_step")) return "capability_step_result";
  if (name.includes("timeline")) return "execution_timeline";
  if (name.includes("model-call") || name.includes("model_call")) return "model_call";
  if (name.endsWith(".log")) return "raw_log";
  return undefined;
}

function summaryFromPath(path: string, kind: ArtifactKindType, now: string): ArtifactSummaryType {
  const relative = path.split(callerCwd()).join("").replace(/^\//, "");
  return createArtifactSummary({
    artifact_id: `${kind}_${relative.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96)}`,
    kind: ArtifactKind.parse(kind),
    title: basename(path),
    summary: `${kind} artifact from ${dirname(relative)}`,
    path_or_uri: relative,
    content_type: extname(path) === ".json" ? "application/json" : "text/markdown",
    created_at: now,
  });
}

function resolveLocalPath(path: string): string {
  return resolve(callerCwd(), path);
}

function callerCwd(): string {
  return process.env.INIT_CWD ?? process.cwd();
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)(m|h|d)$/.exec(value.trim());
  if (!match) throw new Error("Duration must use m, h, or d, for example 30m, 24h, or 7d.");
  const amount = Number(match[1]);
  const unit = match[2];
  if (amount <= 0) throw new Error("Duration must be greater than zero.");
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 60 * 60_000;
  return amount * 24 * 60 * 60_000;
}

function isOpenLagrangePath(path: string): boolean {
  const absolute = resolve(path);
  const root = resolve(callerCwd(), ".open-lagrange");
  return absolute === root || absolute.startsWith(`${root}/`);
}
