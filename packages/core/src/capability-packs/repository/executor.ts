import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { assertReadableRepositoryPath, assertWritableRepositoryPath, resolveRepositoryPath } from "../../repository/path-policy.js";
import { AppliedPatchResult, PatchPreview, type PatchPlan } from "../../schemas/patch-plan.js";
import { DiffReport, RepositoryFileInfo, RepositoryFileRead, RepositorySearchMatch, ReviewReport, VerificationReport, type DiffReport as DiffReportType, type RepositoryFileInfo as RepositoryFileInfoType, type RepositoryFileRead as RepositoryFileReadType, type RepositorySearchMatch as RepositorySearchMatchType, type RepositoryWorkspace, type ReviewReport as ReviewReportType, type VerificationReport as VerificationReportType } from "../../schemas/repository.js";
import { getRepositoryDiff, unifiedPreview } from "./diff.js";
import { runRepositoryVerification } from "./verify.js";

export function listRepositoryFiles(workspace: RepositoryWorkspace, input: { readonly relative_path?: string; readonly max_results?: number }): readonly RepositoryFileInfoType[] {
  const base = resolveRepositoryPath(workspace, input.relative_path ?? ".");
  const start = base.ok && base.absolute_path ? base.absolute_path : workspace.repo_root;
  const output: RepositoryFileInfoType[] = [];
  walk(workspace, start, output, input.max_results ?? workspace.max_files_per_task);
  return output;
}

export function readRepositoryFile(workspace: RepositoryWorkspace, input: { readonly relative_path: string }): RepositoryFileReadType {
  const path = assertReadableRepositoryPath(workspace, input.relative_path);
  const buffer = readFileSync(path.absolute_path);
  return RepositoryFileRead.parse({
    relative_path: path.relative_path,
    content: buffer.toString("utf8"),
    sha256: sha256(buffer),
    size: buffer.length,
    truncated: false,
  });
}

export function searchRepositoryText(workspace: RepositoryWorkspace, input: { readonly query: string; readonly relative_path?: string; readonly max_results?: number }): readonly RepositorySearchMatchType[] {
  const files = listRepositoryFiles(workspace, {
    ...(input.relative_path ? { relative_path: input.relative_path } : {}),
    max_results: workspace.max_files_per_task,
  });
  const matches: RepositorySearchMatchType[] = [];
  for (const file of files) {
    if (matches.length >= (input.max_results ?? 25)) break;
    const read = readRepositoryFile(workspace, { relative_path: file.relative_path });
    const lines = read.content.split("\n");
    for (const [index, line] of lines.entries()) {
      if (!line.toLowerCase().includes(input.query.toLowerCase())) continue;
      matches.push(RepositorySearchMatch.parse({ relative_path: file.relative_path, line_number: index + 1, preview: line.slice(0, 240) }));
      if (matches.length >= (input.max_results ?? 25)) break;
    }
  }
  return matches;
}

export function proposeRepositoryPatch(workspace: RepositoryWorkspace, patchPlan: PatchPlan): ReturnType<typeof PatchPreview.parse> {
  validatePatchPlanForWorkspace(workspace, patchPlan);
  return PatchPreview.parse({
    patch_plan: patchPlan,
    touched_files: patchPlan.files.map((file) => file.relative_path),
    risk_level: patchPlan.risk_level,
    requires_approval: patchPlan.requires_approval || workspace.require_approval_for_write || patchPlan.files.some((file) => file.operation === "delete"),
    diff_preview: previewPatch(workspace, patchPlan),
  });
}

export function applyRepositoryPatch(workspace: RepositoryWorkspace, patchPlan: PatchPlan): ReturnType<typeof AppliedPatchResult.parse> {
  validatePatchPlanForWorkspace(workspace, patchPlan);
  const applied_files = patchPlan.files.map((file) => {
    const path = assertWritableRepositoryPath(workspace, file.relative_path);
    const before = existsSync(path.absolute_path) ? readFileSync(path.absolute_path) : undefined;
    const beforeHash = before ? sha256(before) : undefined;
    if ((file.operation === "modify" || file.operation === "delete") && file.expected_sha256 && beforeHash !== file.expected_sha256) {
      throw new Error(`File hash changed before patch: ${file.relative_path}`);
    }
    if (file.operation === "delete") {
      unlinkSync(path.absolute_path);
      return { relative_path: path.relative_path, operation: file.operation, ...(beforeHash ? { before_sha256: beforeHash } : {}) };
    }
    mkdirSync(dirname(path.absolute_path), { recursive: true });
    const next = file.append_text !== undefined
      ? `${before?.toString("utf8") ?? ""}${file.append_text}`
      : file.full_replacement ?? "";
    const nextBuffer = Buffer.from(next, "utf8");
    if (nextBuffer.length > workspace.max_file_bytes) throw new Error(`Patched file exceeds byte limit: ${file.relative_path}`);
    writeFileSync(path.absolute_path, nextBuffer);
    return {
      relative_path: path.relative_path,
      operation: file.operation,
      ...(beforeHash ? { before_sha256: beforeHash } : {}),
      after_sha256: sha256(nextBuffer),
    };
  });
  return AppliedPatchResult.parse({
    applied_files,
    changed_files: applied_files.map((file) => file.relative_path),
    diff_summary: `${applied_files.length} file(s) changed`,
  });
}

export async function getRepositoryDiffReport(workspace: RepositoryWorkspace, paths: readonly string[] = []): Promise<DiffReportType> {
  return DiffReport.parse(await getRepositoryDiff(workspace, paths));
}

export async function runRepositoryVerificationReport(workspace: RepositoryWorkspace, commandIds: readonly string[]): Promise<VerificationReportType> {
  const results = [];
  for (const command_id of commandIds) {
    results.push(await runRepositoryVerification({ workspace, command_id, timeout_ms: 30_000, output_limit: 20_000 }));
  }
  return VerificationReport.parse({
    results,
    passed: results.every((result) => result.exit_code === 0),
    summary: results.map((result) => `${result.command}: ${result.exit_code}`).join("; "),
  });
}

export function createRepositoryReviewReport(input: {
  readonly goal: string;
  readonly changed_files: readonly string[];
  readonly diff_summary: string;
  readonly verification_report: VerificationReportType;
}): ReviewReportType {
  return ReviewReport.parse({
    pr_title: input.goal.slice(0, 72),
    pr_summary: input.diff_summary || `${input.changed_files.length} file(s) changed`,
    test_notes: input.verification_report.results.length > 0
      ? input.verification_report.results.map((result) => `${result.command}: ${result.exit_code === 0 ? "passed" : "failed"}`)
      : ["No verification command was run."],
    risk_notes: input.verification_report.passed ? ["Verification passed."] : ["One or more verification commands failed."],
    follow_up_notes: [],
  });
}

function validatePatchPlanForWorkspace(workspace: RepositoryWorkspace, patchPlan: PatchPlan): void {
  for (const file of patchPlan.files) {
    assertWritableRepositoryPath(workspace, file.relative_path);
    if (file.unified_diff) throw new Error("Unified diff execution is not supported in this slice");
    if (file.operation === "delete") continue;
    if (file.full_replacement !== undefined && Buffer.byteLength(file.full_replacement, "utf8") > workspace.max_file_bytes) {
      throw new Error(`Full replacement exceeds file size limit: ${file.relative_path}`);
    }
  }
}

function previewPatch(workspace: RepositoryWorkspace, patchPlan: PatchPlan): string {
  return patchPlan.files.map((file) => {
    const decision = resolveRepositoryPath(workspace, file.relative_path);
    const before = decision.ok && decision.absolute_path && existsSync(decision.absolute_path)
      ? readFileSync(assertReadableRepositoryPath(workspace, file.relative_path).absolute_path, "utf8")
      : "";
    const after = file.operation === "delete"
      ? ""
      : file.append_text !== undefined
        ? `${before}${file.append_text}`
        : file.full_replacement ?? before;
    return unifiedPreview(file.relative_path, before, after);
  }).join("\n");
}

function walk(workspace: RepositoryWorkspace, absolutePath: string, output: RepositoryFileInfoType[], maxResults: number): void {
  if (output.length >= maxResults) return;
  const stats = lstatSync(absolutePath);
  if (stats.isSymbolicLink()) return;
  if (stats.isDirectory()) {
    for (const entry of readdirSync(absolutePath)) {
      if (output.length >= maxResults) return;
      walk(workspace, join(absolutePath, entry), output, maxResults);
    }
    return;
  }
  const rel = relative(workspace.repo_root, absolutePath).split("\\").join("/");
  const decision = resolveRepositoryPath(workspace, rel);
  if (!decision.ok || stats.size > workspace.max_file_bytes) return;
  output.push(RepositoryFileInfo.parse({
    relative_path: rel,
    size: stats.size,
    extension: extname(rel),
    modified_at: stats.mtime.toISOString(),
  }));
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
