import { z } from "zod";
import { RepositoryFileRead, RepositorySearchMatch } from "../schemas/repository.js";

export const EvidenceBundle = z.object({
  evidence_bundle_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  goal: z.string().min(1),
  file_excerpts: z.array(RepositoryFileRead),
  file_hashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  findings: z.array(z.string()),
  search_results: z.array(RepositorySearchMatch),
  notes: z.array(z.string()),
  artifact_refs: z.array(z.string()),
  created_at: z.string().datetime(),
}).strict();

export type EvidenceBundle = z.infer<typeof EvidenceBundle>;

export function createEvidenceBundle(input: Omit<EvidenceBundle, "file_hashes">): EvidenceBundle {
  return EvidenceBundle.parse({
    ...input,
    file_hashes: Object.fromEntries(input.file_excerpts.map((file) => [file.relative_path, file.sha256])),
  });
}
