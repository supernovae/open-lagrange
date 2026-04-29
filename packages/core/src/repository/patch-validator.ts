import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { assertWritableRepositoryPath, resolveRepositoryPath } from "./path-policy.js";
import type { RepositoryWorkspace } from "../schemas/repository.js";
import { RepositoryPatchPlan, type RepositoryPatchPlan as RepositoryPatchPlanType } from "./patch-plan.js";

export interface RepositoryPatchValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export function validateRepositoryPatchPlan(workspace: RepositoryWorkspace, input: RepositoryPatchPlanType): RepositoryPatchValidationResult {
  const patchPlan = RepositoryPatchPlan.parse(input);
  const errors: string[] = [];
  if (patchPlan.expected_changed_files.length === 0) errors.push("PatchPlan must declare expected changed files.");
  for (const operation of patchPlan.operations) {
    const decision = resolveRepositoryPath(workspace, operation.relative_path);
    if (!decision.ok) errors.push(`${operation.relative_path}: ${decision.reason ?? "path denied"}`);
    try {
      assertWritableRepositoryPath(workspace, operation.relative_path);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if ((operation.kind === "replace_range" || operation.kind === "insert_after" || operation.kind === "delete_file" || operation.kind === "full_replacement") && existsSync(decision.absolute_path ?? "") && !operation.expected_sha256) {
      errors.push(`${operation.relative_path}: expected hash is required for modify/delete operations.`);
    }
    if (operation.expected_sha256 && decision.absolute_path && existsSync(decision.absolute_path)) {
      const actual = sha256(readFileSync(decision.absolute_path));
      if (actual !== operation.expected_sha256) errors.push(`${operation.relative_path}: expected hash does not match.`);
    }
    if (operation.kind === "full_replacement" && Buffer.byteLength(operation.content ?? "", "utf8") > workspace.max_file_bytes) {
      errors.push(`${operation.relative_path}: full replacement exceeds file size limit.`);
    }
    if (operation.kind === "delete_file" && patchPlan.risk_level !== "destructive" && !patchPlan.approval_required) {
      errors.push(`${operation.relative_path}: broad delete requires explicit approval.`);
    }
    if (isLockfile(operation.relative_path) && !patchPlan.preconditions.some((item) => item.includes("lockfile"))) {
      errors.push(`${operation.relative_path}: lockfile changes require an explicit precondition.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function isLockfile(path: string): boolean {
  return path === "package-lock.json" || path === "pnpm-lock.yaml" || path === "yarn.lock";
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
