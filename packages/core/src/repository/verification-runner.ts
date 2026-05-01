import { spawn } from "node:child_process";
import { stableHash } from "../util/hash.js";
import { VerificationCommand } from "./verification-policy.js";
import { RepositoryVerificationReport, type RepositoryVerificationReport as RepositoryVerificationReportType } from "./verification-report.js";

const UNSAFE_TOKENS = /[|;&<>`$*?()[\]{}]/;

export async function runVerificationPolicy(input: {
  readonly plan_id: string;
  readonly node_id: string;
  readonly cwd: string;
  readonly commands: readonly VerificationCommand[];
  readonly command_ids: readonly string[];
  readonly now?: string;
}): Promise<RepositoryVerificationReportType> {
  const now = input.now ?? new Date().toISOString();
  const selected = input.commands.filter((command) => input.command_ids.includes(command.command_id));
  const commandResults = [];
  for (const command of selected) {
    assertSafeCommand(command);
    commandResults.push(await runCommand(input.cwd, command));
  }
  const failures = commandResults
    .filter((result) => result.status !== "passed")
    .map((result) => ({
      command_id: result.command_id,
      summary: `${result.command_id} ${result.status}`,
      stderr_preview: result.stderr_preview,
    }));
  const artifactId = `verification_${stableHash({ plan: input.plan_id, node: input.node_id, commandResults, now }).slice(0, 18)}`;
  return RepositoryVerificationReport.parse({
    verification_report_id: artifactId,
    plan_id: input.plan_id,
    node_id: input.node_id,
    command_results: commandResults,
    passed: commandResults.length > 0 && commandResults.every((result) => result.status === "passed"),
    failures,
    artifact_id: artifactId,
    created_at: now,
  });
}

function assertSafeCommand(command: VerificationCommand): void {
  for (const token of [command.executable, ...command.args]) {
    if (UNSAFE_TOKENS.test(token)) throw new Error("Verification command contains unsupported shell syntax.");
  }
}

async function runCommand(cwd: string, command: VerificationCommand) {
  const started = Date.now();
  const result = await new Promise<{ readonly stdout: string; readonly stderr: string; readonly exit_code: number | null; readonly timed_out: boolean }>((resolve) => {
    const child = spawn(command.executable, command.args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGTERM");
      resolve({ stdout, stderr, exit_code: null, timed_out: true });
    }, command.timeout_ms);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exit_code: code ?? 1, timed_out: false });
    });
  });
  const stdout = truncate(result.stdout, command.output_limit_bytes);
  const stderr = truncate(result.stderr, command.output_limit_bytes);
  return {
    command_id: command.command_id,
    exit_code: result.exit_code,
    status: result.timed_out ? "timeout" as const : result.exit_code === 0 ? "passed" as const : "failed" as const,
    stdout_preview: stdout.text,
    stderr_preview: stderr.text,
    duration_ms: Math.max(0, Date.now() - started),
    truncated: stdout.truncated || stderr.truncated,
    raw_artifact_id: `verification_log_${stableHash({ command: command.command_id, started }).slice(0, 18)}`,
  };
}

function truncate(value: string, limit: number): { readonly text: string; readonly truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= limit) return { text: value, truncated: false };
  return { text: value.slice(0, limit), truncated: true };
}
