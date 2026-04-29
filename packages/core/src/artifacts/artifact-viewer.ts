import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

export function reindexArtifacts(input: {
  readonly roots?: readonly string[];
  readonly index_path?: string;
  readonly now?: string;
} = {}): ArtifactIndex {
  const now = input.now ?? new Date().toISOString();
  const roots = input.roots ?? [".open-lagrange/demos", ".open-lagrange/plans", ".open-lagrange/skills", ".open-lagrange/generated-packs"];
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

export function createArtifactSummary(input: Omit<ArtifactSummaryType, "created_at" | "redacted" | "exportable"> & {
  readonly created_at?: string;
  readonly redacted?: boolean;
  readonly exportable?: boolean;
}): ArtifactSummaryType {
  const path = resolvePath(input.path_or_uri);
  const size = path && existsSync(path) ? statSync(path).size : undefined;
  return ArtifactSummary.parse({
    ...input,
    created_at: input.created_at ?? new Date().toISOString(),
    redacted: input.redacted ?? true,
    redaction_status: input.redaction_status ?? (input.redacted === false ? "not_redacted" : "redacted"),
    exportable: input.exportable ?? true,
    ...(size === undefined ? {} : { size_bytes: size }),
  });
}

function readArtifactIndex(indexPath: string): ArtifactIndex {
  const path = resolveLocalPath(indexPath);
  if (!existsSync(path)) return ArtifactIndex.parse({ schema_version: "open-lagrange.artifacts.v1", artifacts: [], updated_at: new Date(0).toISOString() });
  return ArtifactIndex.parse(JSON.parse(readFileSync(path, "utf8")));
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
  if (name.includes("research-brief")) return "research_brief";
  if (name.includes("timeline")) return "execution_timeline";
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
