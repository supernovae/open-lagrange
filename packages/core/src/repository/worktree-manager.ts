import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { WorktreeSession, type WorktreeSession as WorktreeSessionType } from "./worktree-session.js";

export interface CreateWorktreeSessionInput {
  readonly repo_root: string;
  readonly plan_id: string;
  readonly allow_dirty_base?: boolean;
  readonly retain_on_failure?: boolean;
  readonly now?: string;
}

export function createWorktreeSession(input: CreateWorktreeSessionInput): WorktreeSessionType {
  const repoRoot = resolve(input.repo_root);
  assertSafePlanId(input.plan_id);
  assertGitRepository(repoRoot);
  if (!input.allow_dirty_base) assertCleanBase(repoRoot);
  const baseCommit = git(repoRoot, ["rev-parse", "HEAD"]);
  const baseRef = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const worktreePath = join(repoRoot, ".open-lagrange", "worktrees", input.plan_id);
  const branchName = `ol/${input.plan_id}`;
  const now = input.now ?? new Date().toISOString();
  mkdirSync(dirname(worktreePath), { recursive: true });
  if (!existsSync(worktreePath)) {
    git(repoRoot, ["worktree", "add", "-B", branchName, worktreePath, baseCommit]);
  }
  return WorktreeSession.parse({
    worktree_id: `worktree_${input.plan_id}`,
    plan_id: input.plan_id,
    repo_root: repoRoot,
    worktree_path: worktreePath,
    base_ref: baseRef,
    base_commit: baseCommit,
    branch_name: branchName,
    status: "created",
    created_at: now,
    updated_at: now,
    retain_on_failure: input.retain_on_failure ?? true,
  });
}

export function cleanupWorktreeSession(session: WorktreeSessionType): WorktreeSessionType {
  const now = new Date().toISOString();
  if (!existsSync(session.worktree_path)) return WorktreeSession.parse({ ...session, status: "cleaned", updated_at: now });
  try {
    git(session.repo_root, ["worktree", "remove", "--force", session.worktree_path]);
  } catch {
    rmSync(session.worktree_path, { recursive: true, force: true });
  }
  return WorktreeSession.parse({ ...session, status: "cleaned", updated_at: now });
}

export function updateWorktreeSessionStatus(
  session: WorktreeSessionType,
  status: WorktreeSessionType["status"],
  extra: { readonly final_patch_artifact_id?: string } = {},
): WorktreeSessionType {
  return WorktreeSession.parse({
    ...session,
    status,
    updated_at: new Date().toISOString(),
    ...(extra.final_patch_artifact_id ? { final_patch_artifact_id: extra.final_patch_artifact_id } : {}),
  });
}

export function assertFinalPatchApplies(session: WorktreeSessionType, patchText: string): void {
  if (!patchText.trim()) return;
  git(session.repo_root, ["apply", "--check", "-"], patchText);
}

export function git(cwd: string, args: readonly string[], stdin?: string): string {
  return gitRaw(cwd, args, stdin).trim();
}

export function gitRaw(cwd: string, args: readonly string[], stdin?: string): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    input: stdin,
    stdio: stdin === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
}

function assertGitRepository(repoRoot: string): void {
  const inside = git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") throw new Error("Repository root is not a git worktree.");
}

function assertSafePlanId(planId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(planId)) {
    throw new Error("Plan ID is not safe for worktree execution.");
  }
}

function assertCleanBase(repoRoot: string): void {
  const status = git(repoRoot, ["status", "--porcelain"]);
  const dirty = status
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith(" .open-lagrange/") && !line.includes(" .open-lagrange/"));
  if (dirty.length > 0) throw new Error("Repository base has uncommitted changes. Use an explicit allow-dirty flag to proceed.");
}
