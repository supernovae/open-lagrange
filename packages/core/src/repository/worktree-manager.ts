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
  mkdirSync(dirname(worktreePath), { recursive: true });
  if (!existsSync(worktreePath)) {
    git(repoRoot, ["worktree", "add", "-B", branchName, worktreePath, baseCommit]);
  }
  return WorktreeSession.parse({
    plan_id: input.plan_id,
    repo_root: repoRoot,
    worktree_path: worktreePath,
    branch_name: branchName,
    base_ref: baseRef,
    base_commit: baseCommit,
    retain_on_failure: input.retain_on_failure ?? true,
    created_at: input.now ?? new Date().toISOString(),
  });
}

export function cleanupWorktreeSession(session: WorktreeSessionType): void {
  if (!existsSync(session.worktree_path)) return;
  try {
    git(session.repo_root, ["worktree", "remove", "--force", session.worktree_path]);
  } catch {
    rmSync(session.worktree_path, { recursive: true, force: true });
  }
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
  if (status.trim()) throw new Error("Repository base has uncommitted changes. Use an explicit allow-dirty flag to proceed.");
}
