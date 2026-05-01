import { z } from "zod";
import { RepositoryFileRead, RepositorySearchMatch } from "../schemas/repository.js";

export const EvidenceFile = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  excerpt: z.string(),
  reason: z.string(),
  line_start: z.number().int().min(1).optional(),
  line_end: z.number().int().min(1).optional(),
}).strict();

export const EvidenceFinding = z.object({
  finding_id: z.string().min(1),
  kind: z.enum(["entrypoint", "symbol", "pattern", "test", "config", "documentation", "user_constraint"]),
  summary: z.string().min(1),
  source_ref: z.string().min(1),
}).strict();

export const EvidenceBundle = z.object({
  evidence_bundle_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  repo_root: z.string().min(1),
  worktree_path: z.string().min(1),
  files: z.array(EvidenceFile),
  file_excerpts: z.array(RepositoryFileRead),
  findings: z.array(EvidenceFinding),
  artifact_id: z.string().min(1),
  created_at: z.string().datetime(),
  file_hashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  search_results: z.array(RepositorySearchMatch),
  notes: z.array(z.string()),
}).strict();

export type EvidenceFile = z.infer<typeof EvidenceFile>;
export type EvidenceFinding = z.infer<typeof EvidenceFinding>;
export type EvidenceBundle = z.infer<typeof EvidenceBundle>;

export function createEvidenceBundle(input: {
  readonly evidence_bundle_id: string;
  readonly plan_id: string;
  readonly node_id: string;
  readonly repo_root: string;
  readonly worktree_path: string;
  readonly file_reads: readonly z.infer<typeof RepositoryFileRead>[];
  readonly findings: readonly EvidenceFinding[];
  readonly search_results?: readonly z.infer<typeof RepositorySearchMatch>[];
  readonly notes?: readonly string[];
  readonly artifact_id?: string;
  readonly created_at?: string;
}): EvidenceBundle {
  const files = input.file_reads.map((file) => EvidenceFile.parse({
    path: file.relative_path,
    sha256: file.sha256,
    excerpt: excerpt(file.content),
    reason: reasonForPath(file.relative_path),
    line_start: 1,
    line_end: Math.min(file.content.split("\n").length, 80),
  }));
  return EvidenceBundle.parse({
    evidence_bundle_id: input.evidence_bundle_id,
    plan_id: input.plan_id,
    node_id: input.node_id,
    repo_root: input.repo_root,
    worktree_path: input.worktree_path,
    files,
    file_excerpts: input.file_reads,
    findings: input.findings,
    artifact_id: input.artifact_id ?? input.evidence_bundle_id,
    created_at: input.created_at ?? new Date().toISOString(),
    file_hashes: Object.fromEntries(files.map((file) => [file.path, file.sha256])),
    search_results: input.search_results ?? [],
    notes: input.notes ?? [],
  });
}

function excerpt(content: string): string {
  const text = content.split("\n").slice(0, 80).join("\n");
  return text.length > 8_000 ? text.slice(0, 8_000) : text;
}

function reasonForPath(path: string): string {
  if (path === "package.json") return "package metadata and scripts";
  if (path.toLowerCase().startsWith("readme")) return "repository documentation";
  if (path.includes("cli") || path.includes("index")) return "likely command entrypoint";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "TypeScript source";
  return "deterministic repository evidence";
}
