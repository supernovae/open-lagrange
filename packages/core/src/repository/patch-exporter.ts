import { writeFileSync } from "node:fs";
import { stableHash } from "../util/hash.js";
import { git, gitRaw, assertFinalPatchApplies } from "./worktree-manager.js";
import type { WorktreeSession } from "./worktree-session.js";

export interface FinalPatchArtifact {
  readonly final_patch_artifact_id: string;
  readonly artifact_id: string;
  readonly plan_id: string;
  readonly base_commit: string;
  readonly unified_diff: string;
  readonly changed_files: readonly string[];
  readonly validation_status: "pass" | "fail";
  readonly created_at: string;
}

export function exportFinalPatch(session: WorktreeSession, outputPath?: string): FinalPatchArtifact {
  const changed_files = git(session.worktree_path, ["diff", "--name-only", session.base_commit])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(".open-lagrange/"));
  const unified_diff = changed_files.length > 0
    ? gitRaw(session.worktree_path, ["diff", session.base_commit, "--", ...changed_files])
    : "";
  assertFinalPatchApplies(session, unified_diff);
  if (outputPath) writeFileSync(outputPath, unified_diff, "utf8");
  const id = `final_patch_${stableHash({ plan_id: session.plan_id, base_commit: session.base_commit, unified_diff }).slice(0, 18)}`;
  return {
    final_patch_artifact_id: id,
    artifact_id: id,
    plan_id: session.plan_id,
    base_commit: session.base_commit,
    unified_diff,
    changed_files,
    validation_status: "pass",
    created_at: new Date().toISOString(),
  };
}
