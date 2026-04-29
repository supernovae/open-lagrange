import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ArtifactRole, RunIndex, RunSummary, type ArtifactRole as ArtifactRoleType, type ArtifactSummary, type RunIndex as RunIndexType, type RunSummary as RunSummaryType } from "./artifact-model.js";
import { DEFAULT_ARTIFACT_INDEX_PATH, listArtifacts } from "./artifact-viewer.js";

export const DEFAULT_RUN_INDEX_PATH = ".open-lagrange/runs/index.json";
export const DEFAULT_LATEST_RUN_PATH = ".open-lagrange/latest/run.json";
export const DEFAULT_LATEST_SUMMARY_PATH = ".open-lagrange/latest/summary.md";

export function registerRun(input: {
  readonly run: RunSummaryType;
  readonly artifacts?: readonly ArtifactSummary[];
  readonly index_path?: string;
  readonly latest_path?: string;
  readonly latest_summary_path?: string;
  readonly now?: string;
}): RunIndexType {
  const now = input.now ?? new Date().toISOString();
  const indexPath = resolveLocalPath(input.index_path ?? DEFAULT_RUN_INDEX_PATH);
  const current = readRunIndex(indexPath);
  const byId = new Map(current.runs.map((run) => [run.run_id, run]));
  const nextRun = RunSummary.parse({ ...input.run, updated_at: now });
  byId.set(nextRun.run_id, nextRun);
  const next = RunIndex.parse({
    schema_version: "open-lagrange.runs.v1",
    runs: [...byId.values()].sort((left, right) => left.started_at.localeCompare(right.started_at)),
    latest_run_id: nextRun.run_id,
    updated_at: now,
  });
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify(next, null, 2), "utf8");
  writeLatestPointers(nextRun, input.latest_path, input.latest_summary_path, input.artifacts ?? []);
  return next;
}

export function listRuns(indexPath = DEFAULT_RUN_INDEX_PATH): readonly RunSummaryType[] {
  return readRunIndex(resolveLocalPath(indexPath)).runs;
}

export function removeRunsByDemo(input: {
  readonly demo_id: string;
  readonly index_path?: string;
  readonly latest_path?: string;
  readonly latest_summary_path?: string;
  readonly now?: string;
}): RunIndexType {
  const now = input.now ?? new Date().toISOString();
  const indexPath = resolveLocalPath(input.index_path ?? DEFAULT_RUN_INDEX_PATH);
  const current = readRunIndex(indexPath);
  const runs = current.runs.filter((run) => run.related_demo_id !== input.demo_id);
  const latest = runs.at(-1);
  const next = RunIndex.parse({
    schema_version: "open-lagrange.runs.v1",
    runs,
    ...(latest ? { latest_run_id: latest.run_id } : {}),
    updated_at: now,
  });
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify(next, null, 2), "utf8");
  if (latest) writeLatestPointers(latest, input.latest_path, input.latest_summary_path);
  else writeEmptyLatestPointers(input.latest_path, input.latest_summary_path);
  return next;
}

export function showRun(runId: string, indexPath = DEFAULT_RUN_INDEX_PATH): RunSummaryType | undefined {
  const index = readRunIndex(resolveLocalPath(indexPath));
  const target = runId === "latest" ? index.latest_run_id : runId;
  if (!target) return undefined;
  return index.runs.find((run) => run.run_id === target);
}

export function listRunArtifacts(input: {
  readonly run_id: string;
  readonly role?: ArtifactRoleType;
  readonly artifact_index_path?: string;
  readonly run_index_path?: string;
}): readonly ArtifactSummary[] {
  const run = showRun(input.run_id, input.run_index_path);
  if (!run) return [];
  const refs = input.role ? refsForRole(run, input.role) : [
    ...run.primary_artifact_refs,
    ...run.supporting_artifact_refs,
    ...run.debug_artifact_refs,
  ];
  const byId = new Map(listArtifacts(input.artifact_index_path ?? DEFAULT_ARTIFACT_INDEX_PATH).map((artifact) => [artifact.artifact_id, artifact]));
  return refs.map((ref) => byId.get(ref)).filter((artifact): artifact is ArtifactSummary => Boolean(artifact));
}

export function recentArtifacts(input: {
  readonly limit?: number;
  readonly artifact_index_path?: string;
  readonly run_index_path?: string;
  readonly include_debug?: boolean;
} = {}): readonly ArtifactSummary[] {
  const limit = input.limit ?? 12;
  const runs = [...listRuns(input.run_index_path)].reverse();
  const artifactsById = new Map(listArtifacts(input.artifact_index_path ?? DEFAULT_ARTIFACT_INDEX_PATH).map((artifact) => [artifact.artifact_id, artifact]));
  const ordered: ArtifactSummary[] = [];
  for (const run of runs) {
    const refs = [
      ...run.primary_artifact_refs,
      ...run.supporting_artifact_refs,
      ...(input.include_debug ? run.debug_artifact_refs : []),
    ];
    for (const ref of refs) {
      const artifact = artifactsById.get(ref);
      if (artifact) ordered.push(artifact);
      if (ordered.length >= limit) return ordered;
    }
  }
  if (ordered.length > 0) return ordered;
  return [...artifactsById.values()]
    .filter((artifact) => input.include_debug || artifact.artifact_role !== "debug_log")
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

export function createRunSummary(input: Omit<RunSummaryType, "pinned"> & { readonly pinned?: boolean }): RunSummaryType {
  return RunSummary.parse({ ...input, pinned: input.pinned ?? false });
}

export function summarizeRun(run: RunSummaryType, artifacts: readonly ArtifactSummary[] = []): string {
  const byId = new Map(artifacts.map((artifact) => [artifact.artifact_id, artifact]));
  const lines = [
    `# ${run.title}`,
    "",
    run.summary,
    "",
    `- Run: ${run.run_id}`,
    `- Status: ${run.status}`,
    `- Started: ${run.started_at}`,
    ...(run.completed_at ? [`- Completed: ${run.completed_at}`] : []),
    ...(run.output_dir ? [`- Output directory: ${run.output_dir}`] : []),
    "",
    "## Primary Outputs",
    ...formatRefs(run.primary_artifact_refs, byId),
    "",
    "## Supporting Artifacts",
    ...formatRefs(run.supporting_artifact_refs, byId),
    "",
    "## Debug Artifacts",
    ...formatRefs(run.debug_artifact_refs, byId),
  ];
  return lines.join("\n");
}

function refsForRole(run: RunSummaryType, role: ArtifactRoleType): readonly string[] {
  const parsed = ArtifactRole.parse(role);
  if (parsed === "primary_output") return run.primary_artifact_refs;
  if (parsed === "supporting_evidence" || parsed === "intermediate") return run.supporting_artifact_refs;
  if (parsed === "debug_log") return run.debug_artifact_refs;
  return [];
}

function readRunIndex(indexPath: string): RunIndexType {
  if (!existsSync(indexPath)) return RunIndex.parse({ schema_version: "open-lagrange.runs.v1", runs: [], updated_at: new Date(0).toISOString() });
  return RunIndex.parse(JSON.parse(readFileSync(indexPath, "utf8")));
}

function writeLatestPointers(run: RunSummaryType, latestPath?: string, latestSummaryPath?: string, artifacts: readonly ArtifactSummary[] = []): void {
  const latest = resolveLocalPath(latestPath ?? DEFAULT_LATEST_RUN_PATH);
  const summary = resolveLocalPath(latestSummaryPath ?? DEFAULT_LATEST_SUMMARY_PATH);
  mkdirSync(dirname(latest), { recursive: true });
  writeFileSync(latest, JSON.stringify(run, null, 2), "utf8");
  mkdirSync(dirname(summary), { recursive: true });
  writeFileSync(summary, summarizeRun(run, artifacts), "utf8");
}

function writeEmptyLatestPointers(latestPath?: string, latestSummaryPath?: string): void {
  const latest = resolveLocalPath(latestPath ?? DEFAULT_LATEST_RUN_PATH);
  const summary = resolveLocalPath(latestSummaryPath ?? DEFAULT_LATEST_SUMMARY_PATH);
  mkdirSync(dirname(latest), { recursive: true });
  writeFileSync(latest, JSON.stringify({ status: "missing", summary: "No runs are indexed." }, null, 2), "utf8");
  mkdirSync(dirname(summary), { recursive: true });
  writeFileSync(summary, "# No Runs\n\nNo runs are indexed yet.\n", "utf8");
}

function formatRefs(refs: readonly string[], artifacts: ReadonlyMap<string, ArtifactSummary>): string[] {
  if (refs.length === 0) return ["- None"];
  return refs.map((ref) => {
    const artifact = artifacts.get(ref);
    return artifact ? `- ${artifact.title} (${artifact.kind}): ${ref}` : `- ${ref}`;
  });
}

function resolveLocalPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
