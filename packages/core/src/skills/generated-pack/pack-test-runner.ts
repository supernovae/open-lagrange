import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export interface PackTestReport {
  readonly typescript_compile_passed: boolean;
  readonly tests_passed: boolean;
  readonly dry_run_passed: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function runPackChecks(packPath: string): PackTestReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const compile = runTool("tsc", ["-p", join(packPath, "tsconfig.json"), "--noEmit"], packPath);
  if (!compile.ok) errors.push(`TypeScript compile failed: ${compile.message}`);
  const testFile = join(packPath, "tests", "pack.test.ts");
  let testsPassed = false;
  if (!existsSync(testFile)) {
    warnings.push("Generated pack test file is missing.");
  } else {
    const tests = runTool("vitest", ["run", "--config", join(packPath, "vitest.config.ts")], packPath);
    testsPassed = tests.ok;
    if (!tests.ok) warnings.push(`Generated pack tests did not complete: ${tests.message}`);
  }
  return {
    typescript_compile_passed: compile.ok,
    tests_passed: testsPassed,
    dry_run_passed: compile.ok,
    errors,
    warnings,
  };
}

function runTool(binary: string, args: readonly string[], cwd: string): { readonly ok: boolean; readonly message: string } {
  const local = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? `${binary}.cmd` : binary);
  return run(existsSync(local) ? local : binary, args, cwd);
}

function run(command: string, args: readonly string[], cwd: string): { readonly ok: boolean; readonly message: string } {
  try {
    execFileSync(command, [...args], { cwd, stdio: "pipe", timeout: 30_000, maxBuffer: 2_000_000 });
    return { ok: true, message: "" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: detail };
  }
}
