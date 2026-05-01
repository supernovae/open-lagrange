import { z } from "zod";
import { StructuredError } from "../schemas/open-cot.js";

export const RepositoryPatchArtifact = z.object({
  patch_artifact_id: z.string().min(1),
  patch_plan_id: z.string().min(1),
  plan_id: z.string().min(1),
  node_id: z.string().min(1),
  changed_files: z.array(z.string().min(1)),
  unified_diff: z.string(),
  before_hashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  after_hashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  apply_status: z.enum(["applied", "failed", "already_applied"]),
  errors: z.array(StructuredError),
  artifact_id: z.string().min(1),
  created_at: z.string().datetime(),
}).strict();

export type RepositoryPatchArtifact = z.infer<typeof RepositoryPatchArtifact>;
