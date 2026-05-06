import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { RepositoryWorkspace } from "../schemas/repository.js";

const SECRET_PATTERNS = [
  /^\.env(?:\..*)?$/,
  /(^|\/).*\.pem$/,
  /(^|\/).*\.key$/,
  /(^|\/)id_rsa$/,
  /(^|\/)id_ed25519$/,
  /(^|\/).*secret.*$/i,
  /(^|\/).*credential.*$/i,
  /(^|\/).*token.*$/i,
];

export interface PathDecision {
  readonly ok: boolean;
  readonly absolute_path?: string;
  readonly relative_path?: string;
  readonly reason?: string;
}

export function resolveRepositoryPath(workspace: RepositoryWorkspace, relativePath: string): PathDecision {
  const repoRoot = resolve(workspace.repo_root);
  const absolutePath = resolve(repoRoot, relativePath);
  const rel = toPosix(relative(repoRoot, absolutePath));
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`) || absolutePath === repoRoot) {
    return { ok: false, reason: "Path is outside the repository root" };
  }
  if (rel === ".git" || rel.startsWith(".git/")) return { ok: false, reason: "Git internals are denied" };
  if (SECRET_PATTERNS.some((pattern) => pattern.test(rel))) return { ok: false, reason: "Secret-like paths are denied" };
  if (!matchesAny(rel, workspace.allowed_paths)) return { ok: false, reason: "Path is not allowed by repository policy" };
  if (matchesAny(rel, workspace.denied_paths)) return { ok: false, reason: "Path is denied by repository policy" };
  return { ok: true, absolute_path: absolutePath, relative_path: rel };
}

export function assertReadableRepositoryPath(workspace: RepositoryWorkspace, relativePath: string): { readonly absolute_path: string; readonly relative_path: string } {
  const decision = resolveRepositoryPath(workspace, relativePath);
  if (!decision.ok || !decision.absolute_path || !decision.relative_path) throw new Error(decision.reason ?? "Path denied");
  assertRealRepositoryTarget(workspace, decision.absolute_path, true);
  const stats = statSync(decision.absolute_path);
  if (stats.size > workspace.max_file_bytes) throw new Error("File exceeds repository policy byte limit");
  return { absolute_path: decision.absolute_path, relative_path: decision.relative_path };
}

export function assertWritableRepositoryPath(workspace: RepositoryWorkspace, relativePath: string): { readonly absolute_path: string; readonly relative_path: string } {
  const decision = resolveRepositoryPath(workspace, relativePath);
  if (!decision.ok || !decision.absolute_path || !decision.relative_path) throw new Error(decision.reason ?? "Path denied");
  assertRealRepositoryTarget(workspace, decision.absolute_path, false);
  return { absolute_path: decision.absolute_path, relative_path: decision.relative_path };
}

function assertRealRepositoryTarget(workspace: RepositoryWorkspace, absolutePath: string, mustExist: boolean): void {
  const realRoot = realpathSync(resolve(workspace.repo_root));
  if (existsSync(absolutePath)) {
    const lst = lstatSync(absolutePath);
    if (lst.isSymbolicLink()) throw new Error("Repository paths may not be symbolic links");
    const realTarget = realpathSync(absolutePath);
    if (!isInside(realRoot, realTarget)) throw new Error("Path resolves outside the repository root");
    return;
  }
  if (mustExist) throw new Error("Repository path does not exist");

  const parent = nearestExistingParent(absolutePath);
  const parentStats = lstatSync(parent);
  if (parentStats.isSymbolicLink()) throw new Error("Repository paths may not be under symbolic links");
  const realParent = realpathSync(parent);
  if (!isInside(realRoot, realParent)) throw new Error("Path parent resolves outside the repository root");
}

function nearestExistingParent(path: string): string {
  let current = dirname(path);
  while (!existsSync(current) && dirname(current) !== current) {
    current = dirname(current);
  }
  return current;
}

function isInside(parent: string, target: string): boolean {
  const rel = relative(parent, target);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel));
}

function matchesAny(path: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

function matchesPattern(path: string, pattern: string): boolean {
  const normalized = toPosix(pattern);
  if (normalized === "**" || normalized === "*") return true;
  if (normalized.endsWith("/**")) return path === normalized.slice(0, -3) || path.startsWith(normalized.slice(0, -2));
  if (normalized.startsWith("**/*.")) return path.endsWith(normalized.slice(4));
  if (normalized.includes("*")) {
    const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(path);
  }
  return path === normalized || path.startsWith(`${normalized}/`);
}

function toPosix(value: string): string {
  return value.split(sep).join("/");
}
