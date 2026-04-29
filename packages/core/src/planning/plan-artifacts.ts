import { z } from "zod";

export const PlanArtifactKind = z.enum([
  "goal_frame",
  "planfile",
  "evidence_bundle",
  "patch_plan",
  "patch_artifact",
  "verification_report",
  "review_report",
  "final_report",
  "final_patch_artifact",
  "worktree_session",
  "markdown_projection",
  "raw_log",
]);

export const PlanArtifactRef = z.object({
  artifact_id: z.string().min(1),
  kind: PlanArtifactKind,
  path_or_uri: z.string().min(1),
  summary: z.string(),
  created_at: z.string().datetime(),
}).strict();

export type PlanArtifactKind = z.infer<typeof PlanArtifactKind>;
export type PlanArtifactRef = z.infer<typeof PlanArtifactRef>;

export interface PlanArtifactStore {
  readonly recordArtifact: (artifact: PlanArtifactRef) => Promise<PlanArtifactRef>;
  readonly listArtifactsForPlan: (planId: string) => Promise<readonly PlanArtifactRef[]>;
}

export function createArtifactRef(input: {
  readonly artifact_id: string;
  readonly kind: PlanArtifactKind;
  readonly path_or_uri: string;
  readonly summary: string;
  readonly created_at: string;
}): PlanArtifactRef {
  return PlanArtifactRef.parse(input);
}
