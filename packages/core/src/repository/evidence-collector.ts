import { stableHash } from "../util/hash.js";
import { RepositoryFileInfo, RepositoryFileRead, RepositorySearchMatch, type RepositoryWorkspace } from "../schemas/repository.js";
import type { CapabilityStepResult } from "../runtime/capability-step-schema.js";
import { createEvidenceBundle, type EvidenceBundle, type EvidenceFinding } from "./evidence-bundle.js";

export type RepositoryCapabilityInvoker = (capabilityRef: string, input: unknown, nodeId: string, inputArtifactRefs?: readonly string[]) => Promise<CapabilityStepResult>;

export async function collectEvidenceBundle(input: {
  readonly plan_id: string;
  readonly node_id: string;
  readonly goal: string;
  readonly workspace: RepositoryWorkspace;
  readonly invoke: RepositoryCapabilityInvoker;
  readonly now?: string;
}): Promise<EvidenceBundle> {
  const listed = await input.invoke("repo.list_files", { relative_path: ".", max_results: input.workspace.max_files_per_task }, input.node_id);
  const files = RepositoryFileInfo.array().parse(listed.output ?? []);
  const selected = selectFiles(files, input.goal).slice(0, Math.min(8, input.workspace.max_files_per_task));
  const reads = [];
  for (const file of selected) {
    const read = await input.invoke("repo.read_file", { relative_path: file.relative_path }, input.node_id);
    reads.push(RepositoryFileRead.parse(read.output));
  }
  const search = await input.invoke("repo.search_text", { query: input.goal, max_results: 12 }, input.node_id);
  const searchResults = RepositorySearchMatch.array().parse(search.output ?? []);
  const findings: EvidenceFinding[] = [
    ...reads.map((file, index) => ({
      finding_id: `finding_file_${index + 1}`,
      kind: kindForPath(file.relative_path),
      summary: `${file.relative_path} selected as bounded repository evidence.`,
      source_ref: file.relative_path,
    } satisfies EvidenceFinding)),
    ...searchResults.slice(0, 5).map((match, index) => ({
      finding_id: `finding_search_${index + 1}`,
      kind: "pattern" as const,
      summary: `Search match in ${match.relative_path}:${match.line_number}.`,
      source_ref: `${match.relative_path}:${match.line_number}`,
    })),
    {
      finding_id: "finding_user_constraint",
      kind: "user_constraint",
      summary: input.goal,
      source_ref: "goal",
    },
  ];
  return createEvidenceBundle({
    evidence_bundle_id: `evidence_${stableHash({ plan: input.plan_id, node: input.node_id, files: reads.map((file) => file.sha256) }).slice(0, 18)}`,
    plan_id: input.plan_id,
    node_id: input.node_id,
    repo_root: input.workspace.repo_root,
    worktree_path: input.workspace.repo_root,
    file_reads: reads,
    findings,
    search_results: searchResults,
    notes: ["Evidence collected through repository capabilities."],
    ...(input.now ? { created_at: input.now } : {}),
  });
}

function selectFiles(files: readonly { readonly relative_path: string }[], goal: string): readonly { readonly relative_path: string }[] {
  const terms = goal.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  return [...files].sort((left, right) => score(right.relative_path, terms) - score(left.relative_path, terms));
}

function score(path: string, terms: readonly string[]): number {
  const lower = path.toLowerCase();
  let value = 0;
  if (path === "package.json") value += 100;
  if (lower.startsWith("readme")) value += 70;
  if (lower.includes("cli") || lower.includes("index")) value += 50;
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) value += 30;
  for (const term of terms) if (lower.includes(term)) value += 15;
  return value;
}

function kindForPath(path: string): EvidenceFinding["kind"] {
  if (path === "package.json" || path.endsWith(".json")) return "config";
  if (path.toLowerCase().startsWith("readme")) return "documentation";
  if (path.includes("cli") || path.includes("index")) return "entrypoint";
  return "symbol";
}
