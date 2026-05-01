import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { BenchmarkScenario } from "./benchmark-scenarios.js";

export interface ScenarioWorkspace {
  readonly workspace_id: string;
  readonly repo_root: string;
  readonly source_description: string;
  readonly cleanup: () => void;
}

export function createScenarioWorkspace(input: {
  readonly scenario: BenchmarkScenario;
  readonly retain?: boolean;
}): ScenarioWorkspace {
  const repoRoot = mkdtempSync(join(tmpdir(), `open-lagrange-eval-${input.scenario.scenario_id}-`));
  if (input.scenario.fixture_repo_path) {
    cpSync(resolve(input.scenario.fixture_repo_path), repoRoot, { recursive: true });
  } else {
    for (const [path, content] of Object.entries(input.scenario.fixture_files ?? {})) {
      const target = join(repoRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    }
  }
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.email", "eval@example.com"]);
  git(repoRoot, ["config", "user.name", "Open Lagrange Eval"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-q", "-m", "fixture"]);
  return {
    workspace_id: `scenario_${input.scenario.scenario_id}`,
    repo_root: repoRoot,
    source_description: input.scenario.fixture_repo_path ?? "inline fixture files",
    cleanup: () => {
      if (!input.retain) rmSync(repoRoot, { recursive: true, force: true });
    },
  };
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}
