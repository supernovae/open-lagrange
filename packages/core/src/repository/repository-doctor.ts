import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { listArtifacts } from "../artifacts/index.js";
import { packRegistry } from "../capability-registry/registry.js";
import { detectVerificationPolicy } from "./verification-policy.js";

export interface RepositoryDoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: "pass" | "warn" | "fail";
  readonly summary: string;
  readonly remediation?: string;
  readonly suggested_command?: string;
}

export interface RepositoryDoctorReport {
  readonly repo_root: string;
  readonly checked_at: string;
  readonly checks: readonly RepositoryDoctorCheck[];
  readonly summary: {
    readonly passed: number;
    readonly warnings: number;
    readonly failures: number;
  };
}

export function runRepositoryDoctor(input: { readonly repo_root: string; readonly now?: string }): RepositoryDoctorReport {
  const repoRoot = resolve(input.repo_root);
  const checkedAt = input.now ?? new Date().toISOString();
  const verification = detectVerificationPolicy(repoRoot);
  const checks: RepositoryDoctorCheck[] = [
    gitAvailableCheck(),
    gitRepoCheck(repoRoot),
    gitCleanCheck(repoRoot),
    runtimeCheck(),
    packRegistryCheck(),
    repositoryPackCheck(),
    modelProviderCheck(),
    artifactIndexCheck(repoRoot),
    worktreePathCheck(repoRoot),
    verificationCommandCheck(verification.allowed_commands.map((command) => command.command_id)),
  ];
  const passed = checks.filter((check) => check.status === "pass").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const failures = checks.filter((check) => check.status === "fail").length;
  return { repo_root: repoRoot, checked_at: checkedAt, checks, summary: { passed, warnings, failures } };
}

function gitAvailableCheck(): RepositoryDoctorCheck {
  try {
    const version = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
    return check("git", "Git", "pass", version);
  } catch {
    return check("git", "Git", "fail", "Git is not available on PATH.", "Install Git before running repository Plan-to-Patch.");
  }
}

function gitRepoCheck(repoRoot: string): RepositoryDoctorCheck {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: repoRoot, encoding: "utf8" }).trim();
    return check("git_repo", "Git repository", resolve(top) === repoRoot ? "pass" : "warn", `Git root is ${top}.`);
  } catch {
    return check("git_repo", "Git repository", "fail", "Path is not a Git repository.", "Run this command from a Git repository or pass --repo <path>.");
  }
}

function gitCleanCheck(repoRoot: string): RepositoryDoctorCheck {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" }).trim();
    return status
      ? check("git_clean", "Base worktree cleanliness", "warn", "Base repository has uncommitted changes.", "Commit, stash, or pass --allow-dirty-base for apply.", "git status --short")
      : check("git_clean", "Base worktree cleanliness", "pass", "Base repository is clean.");
  } catch {
    return check("git_clean", "Base worktree cleanliness", "fail", "Unable to inspect Git status.");
  }
}

function runtimeCheck(): RepositoryDoctorCheck {
  return check("runtime", "Node runtime", "pass", `Node ${process.version}.`);
}

function packRegistryCheck(): RepositoryDoctorCheck {
  const capabilities = packRegistry.listCapabilities().length;
  return capabilities > 0
    ? check("pack_registry", "Pack registry", "pass", `${capabilities} capability descriptor(s) visible.`)
    : check("pack_registry", "Pack registry", "fail", "No capability descriptors are visible.");
}

function repositoryPackCheck(): RepositoryDoctorCheck {
  return packRegistry.getPack("open-lagrange.repository")
    ? check("repository_pack", "Repository Pack", "pass", "Repository Pack is registered.")
    : check("repository_pack", "Repository Pack", "fail", "Repository Pack is not registered.");
}

function modelProviderCheck(): RepositoryDoctorCheck {
  const configured = Boolean(process.env.OPEN_LAGRANGE_MODEL_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY);
  return configured
    ? check("model_provider", "Model provider", "pass", "Model provider credential is visible through environment fallback.")
    : check("model_provider", "Model provider", "warn", "No model provider credential is visible through environment fallback.", "Configure a model provider before model-backed apply.", "open-lagrange model status");
}

function artifactIndexCheck(repoRoot: string): RepositoryDoctorCheck {
  const path = join(repoRoot, ".open-lagrange", "artifacts", "index.json");
  try {
    const count = listArtifacts(path).length;
    return check("artifact_index", "Artifact index", "pass", existsSync(path) ? `${count} artifact(s) indexed.` : "Artifact index will be created on first artifact write.");
  } catch (caught) {
    return check("artifact_index", "Artifact index", "warn", `Artifact index is not readable: ${caught instanceof Error ? caught.message : String(caught)}`, "Run artifact reindex or remove a corrupt local index after preserving needed artifacts.", "open-lagrange artifact reindex");
  }
}

function worktreePathCheck(repoRoot: string): RepositoryDoctorCheck {
  const worktreeRoot = join(repoRoot, ".open-lagrange", "worktrees");
  const parent = dirname(worktreeRoot);
  return existsSync(parent)
    ? check("worktree_path", "Worktree path", "pass", `Worktrees will be created under ${worktreeRoot}.`)
    : check("worktree_path", "Worktree path", "warn", `Worktree parent does not exist yet: ${parent}.`, "It will be created during apply if the repository is writable.");
}

function verificationCommandCheck(commandIds: readonly string[]): RepositoryDoctorCheck {
  return commandIds.length > 0
    ? check("verification_commands", "Verification commands", "pass", `Detected ${commandIds.join(", ")}.`)
    : check("verification_commands", "Verification commands", "warn", "No allowlisted verification commands were detected.", "Add package scripts such as typecheck or test for stronger demo verification.");
}

function check(id: string, label: string, status: RepositoryDoctorCheck["status"], summary: string, remediation?: string, suggestedCommand?: string): RepositoryDoctorCheck {
  return {
    id,
    label,
    status,
    summary,
    ...(remediation ? { remediation } : {}),
    ...(suggestedCommand ? { suggested_command: suggestedCommand } : {}),
  };
}
