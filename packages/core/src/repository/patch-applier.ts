import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { stableHash } from "../util/hash.js";
import type { RepositoryWorkspace } from "../schemas/repository.js";
import { resolveRepositoryPath } from "./path-policy.js";
import { applyPatchOperation, readCurrentContent } from "./patch-operations.js";
import { validateRepositoryPatchPlan } from "./patch-validator.js";
import { RepositoryPatchArtifact } from "./patch-artifact.js";
import type { RepositoryPatchArtifact as RepositoryPatchArtifactType } from "./patch-artifact.js";
import type { RepositoryPatchPlan } from "./patch-plan.js";
import { git, gitRaw } from "./worktree-manager.js";
import type { WorktreeSession } from "./worktree-session.js";

export function applyRepositoryPatchPlan(input: {
  readonly workspace: RepositoryWorkspace;
  readonly session: WorktreeSession;
  readonly patch_plan: RepositoryPatchPlan;
  readonly now?: string;
}): RepositoryPatchArtifactType {
  const now = input.now ?? new Date().toISOString();
  const validation = validateRepositoryPatchPlan(input.workspace, input.patch_plan);
  if (!validation.valid || !validation.normalized_patch_plan) {
    return RepositoryPatchArtifact.parse({
      patch_artifact_id: `patch_artifact_${stableHash({ plan: input.patch_plan.patch_plan_id, now }).slice(0, 18)}`,
      patch_plan_id: input.patch_plan.patch_plan_id,
      plan_id: input.patch_plan.plan_id,
      node_id: input.patch_plan.node_id,
      changed_files: [],
      unified_diff: "",
      before_hashes: {},
      after_hashes: {},
      apply_status: "failed",
      errors: validation.violations,
      artifact_id: `patch_artifact_${stableHash({ failed: input.patch_plan.patch_plan_id, now }).slice(0, 18)}`,
      created_at: now,
    });
  }
  const beforeHashes: Record<string, string> = {};
  const afterHashes: Record<string, string> = {};
  for (const operation of validation.normalized_patch_plan.operations) {
    const decision = resolveRepositoryPath(input.workspace, operation.relative_path);
    if (!decision.ok || !decision.absolute_path) throw new Error(decision.reason ?? "Path denied");
    const before = readCurrentContent(decision.absolute_path);
    if (before !== undefined) beforeHashes[operation.relative_path] = sha256(Buffer.from(before));
    const next = applyPatchOperation({ operation, ...(before === undefined ? {} : { current_content: before }) });
    mkdirSync(dirname(decision.absolute_path), { recursive: true });
    writeFileSync(decision.absolute_path, next, "utf8");
    afterHashes[operation.relative_path] = sha256(Buffer.from(next));
  }
  const unifiedDiff = gitRaw(input.session.worktree_path, ["diff", input.session.base_commit]);
  const changedFiles = git(input.session.worktree_path, ["diff", "--name-only", input.session.base_commit])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(".open-lagrange/"));
  const artifactId = `patch_artifact_${stableHash({ patch: input.patch_plan.patch_plan_id, changedFiles, now }).slice(0, 18)}`;
  return RepositoryPatchArtifact.parse({
    patch_artifact_id: artifactId,
    patch_plan_id: input.patch_plan.patch_plan_id,
    plan_id: input.patch_plan.plan_id,
    node_id: input.patch_plan.node_id,
    changed_files: changedFiles,
    unified_diff: unifiedDiff,
    before_hashes: beforeHashes,
    after_hashes: afterHashes,
    apply_status: "applied",
    errors: [],
    artifact_id: artifactId,
    created_at: now,
  });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
