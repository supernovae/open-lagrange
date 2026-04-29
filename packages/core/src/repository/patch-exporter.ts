import { writeFileSync } from "node:fs";
import { git, gitRaw, assertFinalPatchApplies } from "./worktree-manager.js";
import type { WorktreeSession } from "./worktree-session.js";

export interface FinalPatchArtifact {
  readonly plan_id: string;
  readonly base_commit: string;
  readonly unified_diff: string;
  readonly changed_files: readonly string[];
  readonly created_at: string;
}

export function exportFinalPatch(session: WorktreeSession, outputPath?: string): FinalPatchArtifact {
  const unified_diff = gitRaw(session.worktree_path, ["diff", session.base_commit]);
  assertFinalPatchApplies(session, unified_diff);
  const changed_files = git(session.worktree_path, ["diff", "--name-only", session.base_commit])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (outputPath) writeFileSync(outputPath, unified_diff, "utf8");
  return {
    plan_id: session.plan_id,
    base_commit: session.base_commit,
    unified_diff,
    changed_files,
    created_at: new Date().toISOString(),
  };
}
