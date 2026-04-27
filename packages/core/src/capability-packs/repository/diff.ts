import { spawn } from "node:child_process";
import type { RepositoryWorkspace } from "../../schemas/repository.js";

export async function getRepositoryDiff(workspace: RepositoryWorkspace, paths: readonly string[] = []): Promise<{
  readonly diff_text: string;
  readonly diff_stat: string;
  readonly changed_files: readonly string[];
}> {
  const diff = await runGit(workspace.repo_root, ["diff", "--", ...paths]);
  const stat = await runGit(workspace.repo_root, ["diff", "--stat", "--", ...paths]);
  const names = await runGit(workspace.repo_root, ["diff", "--name-only", "--", ...paths]);
  return {
    diff_text: diff.stdout,
    diff_stat: stat.stdout,
    changed_files: names.stdout.split("\n").map((line) => line.trim()).filter(Boolean),
  };
}

export function unifiedPreview(path: string, before: string, after: string): string {
  if (before === after) return "";
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@",
    ...before.split("\n").map((line) => `-${line}`),
    ...after.split("\n").map((line) => `+${line}`),
  ].join("\n");
}

async function runGit(cwd: string, args: readonly string[]): Promise<{ readonly stdout: string; readonly stderr: string; readonly exit_code: number }> {
  return new Promise((resolve) => {
    const child = spawn("git", [...args], { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("close", (code) => resolve({ stdout, stderr, exit_code: code ?? 1 }));
  });
}
