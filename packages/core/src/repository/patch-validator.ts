import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { structuredError } from "../reconciliation/records.js";
import type { StructuredError } from "../schemas/open-cot.js";
import type { RepositoryWorkspace } from "../schemas/repository.js";
import { assertWritableRepositoryPath, resolveRepositoryPath } from "./path-policy.js";
import { PatchPolicy, RepositoryPatchPlan, type PatchPolicy as PatchPolicyType, type RepositoryPatchPlan as RepositoryPatchPlanType } from "./patch-plan.js";

export interface RepositoryPatchValidationResult {
  readonly valid: boolean;
  readonly ok: boolean;
  readonly normalized_patch_plan?: RepositoryPatchPlanType;
  readonly violations: readonly StructuredError[];
  readonly warnings: readonly string[];
  readonly approval_required: boolean;
  readonly errors: readonly string[];
}

export function validateRepositoryPatchPlan(workspace: RepositoryWorkspace, input: RepositoryPatchPlanType, policy?: PatchPolicyType): RepositoryPatchValidationResult {
  const now = new Date().toISOString();
  const patchPlan = RepositoryPatchPlan.parse(input);
  const patchPolicy = policy ? PatchPolicy.parse(policy) : undefined;
  const violations: StructuredError[] = [];
  const warnings: string[] = [];
  const expected = new Set(patchPlan.expected_changed_files);
  if (patchPlan.requires_scope_expansion) {
    violations.push(error("APPROVAL_REQUIRED", "PatchPlan requires approved scope expansion before patch application.", now));
  }
  if (patchPlan.expected_changed_files.length === 0) violations.push(error("PRECONDITION_FAILED", "PatchPlan must declare expected changed files.", now));
  for (const file of patchPlan.expected_changed_files) {
    if (patchPolicy && !patchPolicy.allowed_files.includes(file)) {
      violations.push(error("POLICY_DENIED", `${file}: expected changed file is outside allowed files.`, now));
    }
    if (patchPolicy?.denied_files.includes(file)) {
      violations.push(error("POLICY_DENIED", `${file}: expected changed file is denied.`, now));
    }
  }
  for (const commandId of patchPlan.verification_command_ids) {
    if (patchPolicy && !patchPolicy.allowed_verification_command_ids.includes(commandId)) {
      violations.push(error("POLICY_DENIED", `${commandId}: verification command is outside allowed commands.`, now));
    }
  }
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
    if (patchPolicy && !patchPolicy.allowed_files.includes(operation.relative_path)) {
      violations.push(error("POLICY_DENIED", `${operation.relative_path}: operation target is outside allowed files.`, now));
    }
    if (patchPolicy?.denied_files.includes(operation.relative_path)) {
      violations.push(error("POLICY_DENIED", `${operation.relative_path}: operation target is denied.`, now));
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
    if (operation.kind === "full_replacement" && patchPolicy && !patchPolicy.allow_full_replacement) {
      violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: full replacement is not allowed by patch policy.`, now));
    }
    if (operation.kind === "full_replacement" && Buffer.byteLength(operation.content ?? "", "utf8") > Math.min(workspace.max_file_bytes, patchPolicy?.full_replacement_max_bytes ?? 64_000)) {
      violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: full replacement exceeds configured limit.`, now));
    }
    if ((operation.kind === "insert_after" || operation.kind === "insert_before") && operation.anchor && existsSync(decision.absolute_path)) {
      validateUniqueAnchor(operation.relative_path, readFileSync(decision.absolute_path, "utf8"), operation.anchor, patchPolicy?.allow_ambiguous_anchors ?? false, violations, now);
    }
    if (operation.kind === "replace_range" && operation.start_anchor && operation.end_anchor && existsSync(decision.absolute_path)) {
      const content = readFileSync(decision.absolute_path, "utf8");
      validateUniqueAnchor(operation.relative_path, content, operation.start_anchor, patchPolicy?.allow_ambiguous_anchors ?? false, violations, now);
      validateUniqueAnchor(operation.relative_path, content, operation.end_anchor, patchPolicy?.allow_ambiguous_anchors ?? false, violations, now);
    }
    if (isLockfile(operation.relative_path) && !patchPlan.preconditions.some((item) => item.summary.toLowerCase().includes("lockfile"))) {
      violations.push(error("PRECONDITION_FAILED", `${operation.relative_path}: lockfile changes require an explicit precondition.`, now));
    }
    if (operation.kind === "unified_diff") warnings.push(`${operation.relative_path}: unified diff operation will be validated through final patch export.`);
  }
  const approvalRequired = patchPlan.approval_required || patchPlan.risk_level === "destructive" || (workspace.require_approval_for_write && patchPlan.risk_level === "write");
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

function validateUniqueAnchor(path: string, content: string, anchor: string, allowAmbiguous: boolean, violations: StructuredError[], now: string): void {
  const first = content.indexOf(anchor);
  if (first < 0) {
    violations.push(error("PRECONDITION_FAILED", `${path}: anchor was not found.`, now));
    return;
  }
  if (!allowAmbiguous && content.indexOf(anchor, first + anchor.length) >= 0) {
    violations.push(error("PRECONDITION_FAILED", `${path}: anchor is ambiguous.`, now));
  }
}
