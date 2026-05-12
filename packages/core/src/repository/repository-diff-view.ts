import type { RepositoryRunView } from "./repository-run-view.js";

export interface RepositoryDiffView {
  readonly changed_files: readonly string[];
  readonly unified_diff: string;
  readonly patch_artifact_id?: string;
  readonly final_patch_artifact_id?: string;
  readonly export_command?: string;
  readonly apply_command?: string;
}

export function buildRepositoryDiffView(view: RepositoryRunView): RepositoryDiffView {
  const patch = view.final_patch ?? view.patch_artifacts.at(-1);
  const latestPatchId = view.patch_artifacts.at(-1)?.artifact_id;
  return {
    changed_files: patch?.changed_files ?? view.files.changed.map((file) => file.path),
    unified_diff: patch?.unified_diff ?? "",
    ...(latestPatchId ? { patch_artifact_id: latestPatchId } : {}),
    ...(view.final_patch?.artifact_id ? { final_patch_artifact_id: view.final_patch.artifact_id } : {}),
    ...(view.final_patch?.export_command ? { export_command: view.final_patch.export_command } : {}),
    ...(view.final_patch?.apply_command ? { apply_command: view.final_patch.apply_command } : {}),
  };
}

export function formatRepositoryDiff(view: RepositoryRunView): string {
  const diff = buildRepositoryDiffView(view);
  if (!diff.unified_diff) {
    return [
      `Repository Run: ${view.run_id}`,
      "Diff: not available yet",
      ...(view.files.changed.length > 0 ? ["", "Changed files:", ...view.files.changed.map((file) => `  ${file.path}`)] : []),
    ].join("\n");
  }
  return [
    `Repository Run: ${view.run_id}`,
    `Changed files: ${diff.changed_files.length}`,
    ...(diff.export_command ? [`Export: ${diff.export_command}`] : []),
    ...(diff.apply_command ? [`Apply manually: ${diff.apply_command}`] : []),
    "",
    diff.unified_diff,
  ].join("\n");
}
