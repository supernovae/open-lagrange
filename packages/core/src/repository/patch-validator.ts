import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { structuredError } from "../reconciliation/records.js";
import type { StructuredError } from "../schemas/open-cot.js";
import type { RepositoryWorkspace } from "../schemas/repository.js";
import { assertWritableRepositoryPath, resolveRepositoryPath } from "./path-policy.js";
import { RepositoryPatchPlan, type RepositoryPatchPlan as RepositoryPatchPlanType } from "./patch-plan.js";

export interface RepositoryPatchValidationResult {
  readonly valid: boolean;
  readonly ok: boolean;
  readonly normalized_patch_plan?: RepositoryPatchPlanType;
  readonly violations: readonly StructuredError[];
  readonly warnings: readonly string[];
  readonly approval_required: boolean;
  readonly errors: readonly string[];
}

export function validateRepositoryPatchPlan(workspace: RepositoryWorkspace, input: RepositoryPatchPlanType): RepositoryPatchValidationResult {
  const now = new Date().toISOString();
  const patchPlan = RepositoryPatchPlan.parse(input);
  const violations: StructuredError[] = [];
  const warnings: string[] = [];
  const expected = new Set(patchPlan.expected_changed_files);
  if (patchPlan.expected_changed_files.length === 0) violations.push(error("PRECONDITION_FAILED", "PatchPlan must declare expected changed files.", now));
  for (const operation of patchPlan.operations) {
    const decision = resolveRepositoryPath(workspace, operation.relative_path);
    if (!decision.ok || !decision.absolute_path) {
      violations.push(error("POLICY_DENIED", `${operation.relative_path}: ${decision.reason ?? "path denied"}`, now));
      continue;
    }
    try {
      assertWritableRepositoryPath(workspace, operation.relative_path);
    } catch (caught) {
      violations.push(error("POLICY_DENIED", caught instanceof Error ? caught.message : String(caught), now));
    }
    if (!expected.has(operation.relative_path)) {
      violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: operation target is outside expected_changed_files.`, now));
    }
    if (operation.relative_path.startsWith(".open-lagrange/") || operation.relative_path === ".open-lagrange") {
      violations.push(error("POLICY_DENIED", `${operation.relative_path}: Open Lagrange internal files cannot be patched.`, now));
    }
    const modifies = operation.kind !== "create_file";
    if (modifies && existsSync(decision.absolute_path) && !operation.expected_sha256) {
      violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: expected hash is required for modify operations.`, now));
    }
    if (operation.expected_sha256 && existsSync(decision.absolute_path)) {
      const actual = sha256(readFileSync(decision.absolute_path));
      if (actual !== operation.expected_sha256) violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: expected hash does not match.`, now));
    }
    if (operation.kind === "full_replacement" && Buffer.byteLength(operation.content ?? "", "utf8") > Math.min(workspace.max_file_bytes, 64_000)) {
      violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: full replacement exceeds configured limit.`, now));
    }
    if (isLockfile(operation.relative_path) && !patchPlan.preconditions.some((item) => item.summary.toLowerCase().includes("lockfile"))) {
      violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: lockfile changes require an explicit precondition.`, now));
    }
    if (operation.kind === "unified_diff") warnings.push(`${operation.relative_path}: unified diff operation will be validated through final patch export.`);
  }
  const approvalRequired = patchPlan.approval_required || patchPlan.risk_level === "write" || patchPlan.risk_level === "destructive";
  return {
    valid: violations.length === 0,
    ok: violations.length === 0,
    ...(violations.length === 0 ? { normalized_patch_plan: patchPlan } : {}),
    violations,
    warnings,
    approval_required: approvalRequired,
    errors: violations.map((item) => item.message),
  };
}

function error(code: StructuredError["code"], message: string, now: string): StructuredError {
  return structuredError({ code, message, now });
}

function isLockfile(path: string): boolean {
  return path === "package-lock.json" || path === "pnpm-lock.yaml" || path === "yarn.lock";
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
